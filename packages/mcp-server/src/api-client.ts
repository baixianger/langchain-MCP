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

// Convert language from user-friendly names to API format
function mapLanguage(lang?: 'python' | 'javascript'): 'py' | 'js' | undefined {
  if (!lang) return undefined;
  return lang === 'python' ? 'py' : 'js';
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
    language?: 'python' | 'javascript';
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/docs', {
      query: input.query,
      limit: input.limit,
      language: mapLanguage(input.language),
    });
  }

  async searchLangchainCode(input: {
    query: string;
    limit?: number;
    language?: 'python' | 'javascript';
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/langchain', {
      query: input.query,
      limit: input.limit,
      language: mapLanguage(input.language),
    });
  }

  async searchLanggraphCode(input: {
    query: string;
    limit?: number;
    language?: 'python' | 'javascript';
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/langgraph', {
      query: input.query,
      limit: input.limit,
      language: mapLanguage(input.language),
    });
  }

  async searchDeepagentCode(input: {
    query: string;
    limit?: number;
    language?: 'python' | 'javascript';
  }): Promise<SearchResponse> {
    return this.request('POST', '/search/deepagent', {
      query: input.query,
      limit: input.limit,
      language: mapLanguage(input.language),
    });
  }

  async getUsage(): Promise<UsageResponse> {
    return this.request('GET', '/usage');
  }
}
