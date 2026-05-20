import postgres from 'postgres';

export interface SqlExecutor {
  query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
}

export function createSupabaseSql(databaseUrl: string): SqlExecutor {
  const sql = postgres(databaseUrl, { prepare: false });
  return {
    async query<T>(strings: TemplateStringsArray, ...values: unknown[]) {
      const result = await sql(strings, ...(values as any[]));
      return result as unknown as T[];
    },
  };
}
