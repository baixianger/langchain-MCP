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
    """Custom OpenRouter embedding function."""

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    def __call__(self, input: Documents) -> Embeddings:
        import httpx
        resp = httpx.post(
            "https://openrouter.ai/api/v1/embeddings",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "input": input},
            timeout=60.0,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        return [d["embedding"] for d in sorted(data, key=lambda x: x["index"])]
