/**
 * HTTP client for LangGraph local development server
 * Default server URL: http://localhost:2024
 *
 * This client provides methods to retrieve traces, runs, and thread data
 * for debugging LangGraph agents.
 */

export const DEFAULT_LANGGRAPH_URL = 'http://localhost:2024';

// Thread types
export interface Thread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  status: 'idle' | 'busy' | 'interrupted' | 'error';
  values?: Record<string, unknown>;
}

export interface ThreadState {
  values: Record<string, unknown>;
  next: string[];
  tasks: Task[];
  metadata: Record<string, unknown>;
  created_at: string;
  parent_checkpoint?: Checkpoint;
  checkpoint: Checkpoint;
}

export interface Checkpoint {
  checkpoint_id: string;
  checkpoint_ns: string;
}

export interface Task {
  id: string;
  name: string;
  path: (string | number)[];
  error?: string;
  interrupts?: Interrupt[];
  state?: Record<string, unknown>;
  result?: unknown;
}

export interface Interrupt {
  value: unknown;
  when: string;
  resumable: boolean;
  ns?: string[];
}

// Run types
export interface Run {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
  status: 'pending' | 'running' | 'error' | 'success' | 'timeout' | 'interrupted';
  metadata: Record<string, unknown>;
  kwargs?: Record<string, unknown>;
  multitask_strategy?: string;
}

export interface RunDetails extends Run {
  // Extended run details with full trace
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

// Assistant types
export interface Assistant {
  assistant_id: string;
  graph_id: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  version: number;
  name: string;
}

// List response types
export interface ListThreadsResponse {
  threads: Thread[];
}

export interface ListRunsResponse {
  runs: Run[];
}

export interface ListAssistantsResponse {
  assistants: Assistant[];
}

// Search params
export interface ThreadSearchParams {
  limit?: number;
  offset?: number;
  status?: 'idle' | 'busy' | 'interrupted' | 'error';
  metadata?: Record<string, unknown>;
}

export interface RunSearchParams {
  limit?: number;
  offset?: number;
}

export class LangGraphClient {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_LANGGRAPH_URL) {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`LangGraph API error (${response.status}): ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Cannot connect to LangGraph server at ${this.baseUrl}. ` +
          `Make sure the server is running with 'langgraph dev'.`
        );
      }
      throw error;
    }
  }

  /**
   * List all threads from the LangGraph server
   */
  async listThreads(params: ThreadSearchParams = {}): Promise<Thread[]> {
    const { limit = 10, offset = 0, status, metadata } = params;

    // Use search endpoint for filtering
    const body: Record<string, unknown> = {
      limit,
      offset,
    };

    if (status) {
      body.status = status;
    }

    if (metadata) {
      body.metadata = metadata;
    }

    const response = await this.request<Thread[]>('POST', '/threads/search', body);
    return response;
  }

  /**
   * Get a specific thread by ID
   */
  async getThread(threadId: string): Promise<Thread> {
    return this.request<Thread>('GET', `/threads/${threadId}`);
  }

  /**
   * Get the current state of a thread
   */
  async getThreadState(threadId: string): Promise<ThreadState> {
    return this.request<ThreadState>('GET', `/threads/${threadId}/state`);
  }

  /**
   * List runs for a specific thread
   */
  async listRuns(threadId: string, params: RunSearchParams = {}): Promise<Run[]> {
    const { limit = 10, offset = 0 } = params;
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    return this.request<Run[]>('GET', `/threads/${threadId}/runs?${queryParams}`);
  }

  /**
   * Get details of a specific run
   */
  async getRun(threadId: string, runId: string): Promise<RunDetails> {
    return this.request<RunDetails>('GET', `/threads/${threadId}/runs/${runId}`);
  }

  /**
   * List all assistants
   */
  async listAssistants(): Promise<Assistant[]> {
    const response = await this.request<Assistant[]>('POST', '/assistants/search', {});
    return response;
  }

  /**
   * Check if the server is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request<unknown>('GET', '/ok');
      return true;
    } catch {
      return false;
    }
  }
}
