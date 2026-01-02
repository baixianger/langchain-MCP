export interface SearchResult {
  id: string;
  content: string;
  metadata: {
    filePath: string;
    language?: string;
    product?: string;
    topic?: string;
    codeType?: string;
  };
  distance: number;
  repo: string;
}

export interface SearchResponse {
  results: SearchResult[];
  usage: {
    tokens_used: number;
    credits_remaining: number;
  };
}

export interface UsageResponse {
  clerk_id: string;
  credits: {
    remaining_cents: number;
    remaining: number;
  };
  usage: {
    today: { tokens: number; requests: number };
    this_month: { tokens: number; requests: number };
    all_time: { tokens: number; requests: number };
  };
}

export interface APIError {
  error: {
    code: string;
    message: string;
  };
}

export class APIClient {
  constructor(
    private baseUrl: string,
    private sessionToken: string
  ) {}

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as APIError;
      if (error.error?.code === 'INSUFFICIENT_CREDITS') {
        throw new Error('Insufficient credits. Visit https://langchain-mcp.xyz to add more credits.');
      }
      if (error.error?.code === 'UNAUTHORIZED') {
        throw new Error('Session expired. Run: langchain-mcp login');
      }
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    return data as T;
  }

  async searchDocs(input: {
    query: string;
    limit?: number;
    product?: string;
    language?: string;
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/docs', input);
  }

  async searchCode(input: {
    query: string;
    limit?: number;
    product?: string;
    language?: string;
    code_type?: string;
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/code', input);
  }

  async searchHybrid(input: {
    query: string;
    limit?: number;
    include_docs?: boolean;
    include_code?: boolean;
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/hybrid', input);
  }

  async getUsage(): Promise<UsageResponse> {
    return this.request('GET', '/usage');
  }
}
