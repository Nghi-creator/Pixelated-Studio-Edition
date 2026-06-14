export const mergeCommentPage = <T>(
  currentComments: T[],
  nextComments: T[],
  isInitial: boolean,
) => (isInitial ? nextComments : [...currentComments, ...nextComments]);
