## Contributors

This project was created by the **GitOdyssey Team**:

- **Dylan Pina** ([@DylanPina](https://github.com/DylanPina))
- **Will Sullivan** ([@wsulliv8](https://github.com/wsulliv8))
- **Pranav Senthilvel** ([@pranavs28](https://github.com/pranavs28))

## Inspiration
In large organizations, onboarding new developers to massive codebases can take months. Even experienced engineers spend significant time tracing commits, PRs, and diffs just to understand how a feature evolved. We realized this is a *huge productivity bottleneck* and in the world of AI, where 6 months can mean an entirely new generation of technology, that delay is unacceptable.  
So, we built **GitOdyssey** a tool to help developers *learn their codebase at the speed of thought.*

## What it does
GitOdyssey transforms a Git repository into an interactive, AI-powered knowledge graph. It uses semantic search and commit-level summarization to let developers:
- Ask natural-language questions about their codebase (e.g., *“When was authentication refactored?”*).
- Explore diffs, PRs, and commits visually through a connected commit graph.
- Understand *why* code changed not just *what* changed.

## How we built it
- **Backend:** Python + FastAPI + **Gemini 2.5 Flash**
- **Indexing:** We combined keyword search and vector embeddings via **Google Gemini** for hybrid retrieval.
- **Frontend:** React + Tailwind + Vite for a clean and fast developer experience, featuring an interactive commit visualization and semantic query interface.
- **Infrastructure:** Supabase for hosting our Postgres database and Renderer for hosting our backend server and frontend

## Challenges we ran into
- Traversing and storing large commit histories efficiently without bloating storage.
- Designing a schema that supports both semantic and keyword search.
- Balancing retrieval accuracy and performance in our hybrid index.
- Building an intuitive UI to visualize complex Git histories.

## Accomplishments that we're proud of
- Built a fully functional prototype in under 36 hours.
- Designed a scalable ingestion pipeline that can walk entire repositories.
- Integrated natural-language search to make exploring commits as easy as asking a question.
- Created a beautiful and fast React interface for visual commit exploration.

## What we learned
- How to integrate LLMs into developer tooling in a meaningful way
- The importance of data modeling when bridging symbolic and semantic domains.
- Building for developers means obsessing over latency, clarity, and control.

## What's next for GitOdyssey
Expanding GitOdyssey into a full-fledged **AI-assisted version control platform**:
- Multi-repo cross-search for org-wide context.
- PR and release-level summarization.
- Integration with GitHub and GitLab APIs for real-time sync.
- Cloud deployment for collaborative knowledge sharing.

Our long-term vision: leverage AI to improve version control, empowering developers to ship faster and onboard effortlessly.
