"""Embedding function factory."""

import os
from chromadb import Documents, EmbeddingFunction, Embeddings


def get_embedding_function(config: dict) -> EmbeddingFunction:
    """Get embedding function based on config."""

    provider = config["embedding"]["provider"]
    model = config["embedding"]["model"]

    if provider == "sentence-transformer":
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        return SentenceTransformerEmbeddingFunction(
            model_name=model,
            device=config["embedding"].get("device", "cpu"),
        )

    elif provider == "openai":
        from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY env var required")
        return OpenAIEmbeddingFunction(api_key=api_key, model_name=model)

    elif provider == "cohere":
        from chromadb.utils.embedding_functions import CohereEmbeddingFunction
        api_key = os.environ.get("COHERE_API_KEY")
        if not api_key:
            raise ValueError("COHERE_API_KEY env var required")
        return CohereEmbeddingFunction(api_key=api_key, model_name=model)

    elif provider == "google":
        from chromadb.utils.embedding_functions import GoogleGenerativeAiEmbeddingFunction
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY env var required")
        return GoogleGenerativeAiEmbeddingFunction(api_key=api_key, model_name=model)

    elif provider == "ollama":
        from chromadb.utils.embedding_functions import OllamaEmbeddingFunction
        url = config["embedding"].get("url", "http://localhost:11434")
        return OllamaEmbeddingFunction(url=url, model_name=model)

    elif provider == "openrouter":
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY env var required")
        return OpenRouterEmbeddingFunction(model=model, api_key=api_key)

    else:
        raise ValueError(f"Unknown provider: {provider}")


class OpenRouterEmbeddingFunction(EmbeddingFunction):
    """OpenRouter embedding function using official SDK with batching."""

    def __init__(self, model: str, api_key: str, batch_size: int = 10):
        from openrouter import OpenRouter
        self.model = model
        self.client = OpenRouter(api_key=api_key)
        self.batch_size = batch_size

    def __call__(self, input: Documents) -> Embeddings:
        # Process in batches to avoid API limits
        all_embeddings = []
        for i in range(0, len(input), self.batch_size):
            batch = input[i:i + self.batch_size]
            embeddings = self._embed_batch(batch)
            all_embeddings.extend(embeddings)
        return all_embeddings

    def _embed_batch(self, batch: Documents) -> Embeddings:
        import time

        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                # Use official SDK
                result = self.client.embeddings.generate(
                    input=batch,
                    model=self.model,
                )
                # Extract embeddings from response
                return [d.embedding for d in sorted(result.data, key=lambda x: x.index)]

            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                # Retry on rate limits or server errors
                if any(x in error_str for x in ["rate", "limit", "429", "500", "502", "503", "504", "timeout"]):
                    if attempt < max_retries - 1:
                        wait_time = 2 ** attempt
                        time.sleep(wait_time)
                        continue
                raise

        raise last_error
