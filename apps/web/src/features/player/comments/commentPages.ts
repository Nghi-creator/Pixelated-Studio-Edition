export const mergeCommentPage = <T extends { id: string }>(
  currentComments: T[],
  nextComments: T[],
  isInitial: boolean,
) => {
  if (isInitial) return nextComments;

  const knownIds = new Set(currentComments.map((comment) => comment.id));
  return [
    ...currentComments,
    ...nextComments.filter((comment) => !knownIds.has(comment.id)),
  ];
};
