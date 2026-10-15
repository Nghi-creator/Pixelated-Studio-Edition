import type { FakeSupabase, RecordRow, TableName } from "./dataBoundaryDatabase.js";

type Filter = {
  field: string;
  op: "eq" | "gte" | "ilike" | "in" | "not_in";
  value: unknown;
};

export class FakeQueryBuilder {
  private action: "delete" | "insert" | "select" | "update" | "upsert" | null =
    null;
  private filters: Filter[] = [];
  private limitCount: number | null = null;
  private orderConfig: { ascending: boolean; field: string } | null = null;
  private payload: RecordRow | null = null;
  private rangeConfig: { end: number; start: number } | null = null;
  private shouldCount = false;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  select(_columns?: string, options?: { count?: "exact" }) {
    this.action = this.action || "select";
    this.shouldCount = options?.count === "exact";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }

  ilike(field: string, value: string) {
    this.filters.push({ field, op: "ilike", value });
    return this;
  }

  in(field: string, value: unknown[]) {
    this.filters.push({ field, op: "in", value });
    return this;
  }

  not(field: string, operator: "in", value: string) {
    if (operator === "in") {
      this.filters.push({
        field,
        op: "not_in",
        value: value.replace(/^\(|\)$/g, "").split(","),
      });
    }
    return this;
  }

  order(field: string, options: { ascending: boolean } = { ascending: true }) {
    this.orderConfig = { ascending: options.ascending, field };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  returns<T>() {
    return this.execute().then((result) => ({
      data: result.data as T,
      error: result.error,
    }));
  }

  range(start: number, end: number) {
    this.rangeConfig = { end, start };
    return this;
  }

  insert(payload: RecordRow) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: RecordRow) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: RecordRow, _options?: RecordRow) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  async single<T>() {
    const rows = await this.executeRows();
    return {
      data: (rows[0] as T) || null,
      error: rows[0] ? null : new Error("Not found"),
    };
  }

  async maybeSingle<T>() {
    const rows = await this.executeRows();
    return { data: (rows[0] as T) || null, error: null };
  }

  then<TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute()
      .then(onfulfilled || undefined)
      .catch(onrejected || undefined);
  }

  private async execute() {
    const rows = await this.executeRows();
    return {
      count: this.shouldCount ? this.filteredRows().length : null,
      data: rows,
      error: null,
    };
  }

  private async executeRows() {
    let updatedRows: RecordRow[] | null = null;

    if (this.action === "insert" && this.payload) {
      this.db.rows[this.table].push({
        id: `${this.table}-${this.db.rows[this.table].length + 1}`,
        ...this.payload,
      });
    }

    if (this.action === "upsert" && this.payload) {
      const existing =
        this.filteredRows()[0] ||
        (this.table === "local_engine_pairings"
          ? this.db.rows[this.table].find(
              (row) => row.user_id === this.payload?.user_id,
            )
          : this.table === "access_logs"
            ? this.db.rows[this.table].find(
                (row) => row.session_id === this.payload?.session_id,
              )
            : undefined);
      if (existing) Object.assign(existing, this.payload);
      else {
        this.db.rows[this.table].push({
          created_at: new Date().toISOString(),
          id: `${this.table}-${this.db.rows[this.table].length + 1}`,
          ...this.payload,
        });
      }
    }

    if (this.action === "update" && this.payload) {
      updatedRows = this.filteredRows();
      for (const row of updatedRows) {
        Object.assign(row, this.payload);
      }
    }

    if (this.action === "delete") {
      const rowsToDelete = new Set(this.filteredRows());
      this.db.rows[this.table] = this.db.rows[this.table].filter(
        (row) => !rowsToDelete.has(row),
      );
      return [];
    }

    let rows = updatedRows || this.filteredRows();
    if (this.orderConfig) {
      rows = [...rows].sort((left, right) => {
        const leftRawValue = left[this.orderConfig?.field || ""];
        const rightRawValue = right[this.orderConfig?.field || ""];
        if (
          typeof leftRawValue === "number" &&
          typeof rightRawValue === "number"
        ) {
          return this.orderConfig?.ascending
            ? leftRawValue - rightRawValue
            : rightRawValue - leftRawValue;
        }

        const leftValue = String(leftRawValue || "");
        const rightValue = String(rightRawValue || "");
        return this.orderConfig?.ascending
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue);
      });
    }
    if (this.rangeConfig) {
      rows = rows.slice(this.rangeConfig.start, this.rangeConfig.end + 1);
    }
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  private filteredRows() {
    return this.db.rows[this.table].filter((row) =>
      this.filters.every((filter) => {
        const rowValue = getNestedValue(row, filter.field);
        if (filter.op === "gte") {
          return String(rowValue) >= String(filter.value);
        }
        if (filter.op === "ilike") {
          const pattern = String(filter.value)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replaceAll("%", ".*");
          return new RegExp(`^${pattern}$`, "i").test(
            String(rowValue || ""),
          );
        }
        if (filter.op === "in" && Array.isArray(filter.value)) {
          return filter.value.includes(rowValue);
        }
        if (filter.op === "not_in" && Array.isArray(filter.value)) {
          return !filter.value.includes(rowValue);
        }

        return rowValue === filter.value;
      }),
    );
  }
}

function getNestedValue(row: RecordRow, field: string): unknown {
  return field
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      row,
    );
}
