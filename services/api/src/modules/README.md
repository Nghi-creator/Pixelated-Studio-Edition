# API module architecture

Modules are organized by product capability. A module only creates the layers it
actually needs; empty layers are not required.

- `domain/` contains product types, policies, and deterministic rules. It must not
  import Fastify, Supabase, storage, the filesystem, or other external SDKs.
- `application/` contains use cases and workflow orchestration. It must not import
  Fastify or concrete Supabase clients. External effects are supplied through
  narrow ports or injected functions.
- `infrastructure/` contains Supabase repositories, storage adapters, external
  commands, filesystem sources, caches, and other technology-specific code.
- `http/` contains Fastify route registration, request contracts, hooks, and HTTP
  response mapping.

Specialized capabilities may be nested below a module. For example, catalog
ingestion is a feature with its own domain, application, and infrastructure code.

Dependency direction:

```text
http -> application -> domain
infrastructure -> application/domain contracts
composition -> http + application + infrastructure
```

Small cross-cutting modules such as `cache` and `security` may remain flatter when
additional directories would only add ceremony.
