export const getPaginationParams = (query: {
  page?: unknown;
  limit?: unknown;
}) => {
  const pageRaw = Number(query.page || 1);
  const limitRaw = Number(query.limit || 50);

  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100
      ? limitRaw
      : 50;

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return {
    page,
    limit,
    from,
    to,
  };
};

export const getTotalPages = (total: number, limit: number) => {
  return Math.ceil(total / limit);
};