// frontend/lib/api.ts
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export const api = (path: string) => `${API_BASE}${path}`;
