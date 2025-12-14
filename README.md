# GitOdyssey: AI-Powered Codebase Knowledge Graph

GitOdyssey transforms Git repositories into interactive, AI-powered knowledge graphs, enabling developers to understand codebase evolution through natural language queries and visual commit exploration.

Feel free to watch the demo video below for a quick overview.

[![Watch the Demo](https://img.youtube.com/vi/DYcpnQevTuk/0.jpg)](https://youtu.be/DYcpnQevTuk)

## Contributors

This project was created by the **GitOdyssey Team**:

- **Dylan Pina** ([@DylanPina](https://github.com/DylanPina))
- **Will Sullivan** ([@wsulliv8](https://github.com/wsulliv8))
- **Pranav Senthilvel** ([@pranavs28](https://github.com/pranavs28))

## Technologies & Stack

[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL + pgvector](https://img.shields.io/badge/PostgreSQL%20%2B%20pgvector-enabled-336791.svg)](https://github.com/pgvector/pgvector)
[![LangChain](https://img.shields.io/badge/LangChain-latest-1C3C3C.svg)](https://www.langchain.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.0%20Flash%20Lite-4285F4.svg)](https://ai.google.dev/)
[![OpenAI Embeddings](https://img.shields.io/badge/OpenAI-embeddings-412991.svg)](https://platform.openai.com/docs/guides/embeddings)

### Backend Architecture

- **Language & Framework:** Python 3.13 with FastAPI for high-performance async API development
- **AI/ML Stack:**
  - Google Gemini 2.0 Flash Lite for LLM-powered summarization and Q&A
  - OpenAI text-embedding-3-small (1536-dimensional vectors) for semantic embeddings
  - LangChain for prompt orchestration and chain composition
- **Database:** PostgreSQL 16.3 with pgvector extension for efficient vector similarity search
- **ORM:** SQLAlchemy with declarative models and relationship mapping
- **Git Processing:** pygit2 (libgit2 bindings) for native Git repository traversal
- **Authentication:** OAuth 2.0 with GitHub via Authlib/Starlette integration

### Frontend Architecture

[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-latest-3178C6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-latest-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC.svg)](https://tailwindcss.com/)
[![Monaco Editor](https://img.shields.io/badge/Monaco_Editor-enabled-007ACC.svg)](https://microsoft.github.io/monaco-editor/)
[![React Flow](https://img.shields.io/badge/React_Flow-@xyflow-FF0072.svg)](https://xyflow.com/)

- **Framework:** React 19 with TypeScript for type-safe component development
- **Build Tool:** Vite for fast development and optimized production builds
- **Styling:** Tailwind CSS 4.x with custom design system
- **UI Components:** Radix UI primitives for accessible, unstyled components
- **Graph Visualization:**
  - React Flow (@xyflow/react) for interactive node-based graphs
  - Dagre algorithm for automatic hierarchical graph layout
- **Code Display:** Monaco Editor (VS Code editor) for syntax-highlighted diff viewing
- **State Management:** React Hooks with custom hooks for data fetching and caching
- **Routing:** React Router v7 for client-side navigation

### Infrastructure & DevOps

[![AWS](https://img.shields.io/badge/AWS-deployed-FF9900.svg)](https://aws.amazon.com/)
[![Terraform](https://img.shields.io/badge/Terraform-IaC-844FBA.svg)](https://www.terraform.io/)
[![Docker](https://img.shields.io/badge/Docker-enabled-2496ED.svg)](https://www.docker.com/)

- **Cloud Platform:** AWS (ECS Fargate, RDS, S3, CloudFront, ALB, VPC)
- **Infrastructure as Code:** Terraform for declarative infrastructure provisioning
- **Containerization:** Docker with multi-stage builds
- **Database Hosting:** AWS RDS PostgreSQL with pgvector extension
- **CDN & Static Hosting:** CloudFront + S3 for global frontend distribution
- **Load Balancing:** Application Load Balancer with health checks
- **Secrets Management:** AWS Secrets Manager for API keys and credentials

## Core Technical Strategies

### Hybrid Search Architecture

We implemented a **two-stage hybrid retrieval system** that combines symbolic (SQL) and semantic (vector) search:

1. **Symbolic Filtering Stage:** Apply SQL filters (author, date range, file paths, commit status) to narrow the search space

![Semantic Search](docs/search_1.jpg)

2. **Semantic Ranking Stage:** Use cosine similarity on vector embeddings across three granularity levels:
   - **Commit-level embeddings** (message + metadata) with similarity threshold 0.5
   - **File-change-level embeddings** (summarized file modifications) with threshold 0.6
   - **Diff-hunk-level embeddings** (code-level changes) with threshold 0.6

The system uses SQLAlchemy's `union_all` to combine results from all three levels, then applies window functions (`row_number()`) to select the best match per commit based on similarity scores.

![Node Highlighting](docs/search_highlight.jpg)

### Multi-Level Embedding Strategy

We generate embeddings at three hierarchical levels to capture context at different granularities:

- **Commits:** Embed commit messages and author metadata for high-level understanding
- **File Changes:** Embed AI-generated summaries of file modifications (additions, deletions, renames)
- **Diff Hunks:** Embed both raw diff content and AI-summarized hunk descriptions for code-level precision

This multi-level approach enables the system to match queries at the appropriate abstraction level, improving retrieval accuracy for both high-level questions ("When was auth refactored?") and code-specific queries ("How was error handling changed?").

### Retrieval-Augmented Generation (RAG)

Our chat system implements RAG with the following pipeline:

1. **Query Embedding:** Convert user question to 1536-dimensional vector
2. **Semantic Retrieval:** Find top-5 most relevant context items (commits, file changes, hunks) using cosine similarity
3. **Context Ranking:** Sort by similarity and apply threshold filtering (similarity > 0.3)
4. **Prompt Engineering:** Construct context-aware prompts with citations
5. **LLM Generation:** Use Gemini 2.0 Flash Lite with temperature 0.2 for consistent, factual responses
6. **Citation Tracking:** Return source commits with similarity scores for transparency

### Hierarchical Summarization Pipeline

We use a **bottom-up summarization strategy** to generate rich context at each level:

1. **Hunk Summarization:** LLM summarizes individual diff hunks, explaining code changes
2. **File Change Aggregation:** LLM aggregates multiple hunk summaries into file-level summaries
3. **Commit Summarization:** LLM synthesizes all file changes into commit-level narratives

This hierarchical approach ensures that summaries at each level contain relevant detail while maintaining context, enabling better embedding quality and retrieval accuracy.

### Lazy Summarization & Progressive Embedding Enhancement

We implement a **lazy summarization strategy** that optimizes both cost and performance:

1. **Initial Ingestion:** During repository ingestion, we embed only raw content:

   - Commit messages (with author metadata)
   - Raw diff hunk content (code patches)
   - No AI-generated summaries are created at this stage

2. **On-Demand Summarization:** Summaries are generated only when users explicitly request them:

   - Users can request commit-level, file-level, or hunk-level summaries via API endpoints
   - Summaries are generated using Gemini 2.0 Flash Lite with specialized prompts
   - Each summary explains _what_ changed and _why_ it changed

3. **Progressive Embedding Enhancement:** When summaries are generated, we immediately embed them and update the database:
   - Summary embeddings replace raw content embeddings (summaries provide better semantic signal)
   - This means semantic search improves over time as more summaries are generated
   - The system uses batch embedding to efficiently update multiple entities at once

This approach provides several benefits:

- **Cost Efficiency:** Only generate summaries for content users actually view
- **Performance:** Fast initial ingestion without waiting for LLM processing
- **Quality Improvement:** Embeddings improve progressively as summaries are added
- **User-Driven:** Summaries are generated based on actual user interest

### Interactive Diff View with Section-Level Summarization

![Diff View](docs/diff.jpg)

The commit detail view features a sophisticated **Monaco Editor-based diff viewer** with granular summarization capabilities:

1. **Side-by-Side Diff Display:**

   - Monaco Editor (VS Code's editor) provides syntax highlighting and familiar UX
   - Side-by-side comparison of original and modified code
   - Automatic language detection based on file extensions
   - Interactive navigation with line numbers and scroll synchronization

2. **File-Level Summarization:**

   - Each file change panel has a "Summarize" button
   - Generates a comprehensive summary of all changes in the file
   - Summary explains the overall intent and impact of file modifications
   - Displayed in an expandable section above the diff editor

3. **Hunk-Level Summarization:**

   - Each code hunk (section of changes) can be individually summarized
   - Users click "Summarize" on specific hunks to get targeted explanations
   - Summaries explain the specific code changes, logic modifications, and intent
   - Each hunk summary is displayed in an expandable card below the diff

4. **Interactive Navigation:**
   - Click on any hunk label to jump directly to that section in the diff editor
   - Editor automatically scrolls and highlights the relevant lines
   - Enables quick navigation between summary and code context

This granular approach allows users to:

- Understand high-level file changes at a glance
- Drill down into specific code sections for detailed explanations
- Navigate seamlessly between summaries and actual code changes
- Build understanding progressively from file → hunk → line level

![Diff View Alternate](docs/diff_2.jpg)

### Graph Layout Algorithm

![Node Highlighting Alternate View](docs/search.jpg)

For commit visualization, we implemented **Dagre-based automatic layout**:

- Uses Dagre's hierarchical graph layout algorithm (top-to-bottom or left-to-right)
- Configurable node spacing (200px horizontal, 80px vertical)
- Automatic edge routing with collision avoidance
- React Flow integration for interactive pan/zoom and node selection

The graph represents commits as nodes and parent-child relationships as edges, enabling visual exploration of repository history.

### Data Modeling: Bridging Symbolic and Semantic Domains

Our database schema bridges traditional relational data (commits, files, branches) with vector embeddings:

- **Hybrid Schema Design:** Each entity (Commit, FileChange, DiffHunk) has both traditional columns (SHA, paths, timestamps) and vector columns (1536-dim embeddings)
- **Relationship Preservation:** Maintains Git's graph structure (parent commits, branches) while enabling semantic search
- **Efficient Indexing:** pgvector's HNSW indexes for fast approximate nearest neighbor search
- **File Exclusion Patterns:** Intelligent filtering of config files, lock files, and generated artifacts from semantic search to improve signal-to-noise ratio

### Performance Optimizations

- **Lazy Summarization:** On-demand summary generation reduces initial ingestion time and LLM API costs by 90%+ while maintaining search quality
- **Batch Embedding:** Token-aware batching (2048 tokens for Gemini, 25K for OpenAI) to minimize API calls
- **Progressive Embedding Updates:** Summary embeddings replace raw content embeddings when generated, improving semantic search quality over time
- **Eager Loading:** SQLAlchemy `joinedload` to prevent N+1 queries when fetching commit hierarchies
- **Query Optimization:** CTEs and window functions to minimize database round trips
- **Frontend Caching:** React hooks with localStorage for repository metadata caching
- **CDN Distribution:** CloudFront for global static asset delivery

## Key Design Decisions

### Why Hybrid Search?

Pure vector search struggles with exact matches (author names, file paths, dates). Pure keyword search misses semantic relationships. Our hybrid approach leverages the strengths of both: SQL filters provide precision, vector search provides semantic understanding.

### Why Multi-Level Embeddings?

Different queries require different levels of detail. A question about "authentication" might match at the commit level, while "error handling in UserService" needs hunk-level precision. Multi-level embeddings enable matching at the right granularity.

### Why Hierarchical Summarization?

Bottom-up summarization ensures that higher-level summaries contain accurate, detailed information. This improves embedding quality and enables the LLM to provide more accurate answers with proper context.

### Why Lazy Summarization?

Generating summaries for every commit, file, and hunk during ingestion would be prohibitively expensive and slow. Instead, we:

- Embed raw content initially for fast ingestion and basic semantic search
- Generate summaries on-demand based on user interest
- Update embeddings with summaries when generated, progressively improving search quality
- Balance cost efficiency with quality by only summarizing what users actually view

## Architecture Patterns

- **Service-Oriented Design:** Separation of concerns with dedicated services (IngestService, ChatService, FilterService)
- **Repository Pattern:** Abstraction layer for Git operations (core/repo.py)
- **Adapter Pattern:** Database adapter for converting between domain models and SQLAlchemy models
- **Dependency Injection:** FastAPI's dependency system for clean service composition
- **Factory Pattern:** Embedder abstraction (BaseEmbedder) with multiple implementations (OpenAI, Gemini)

## Challenges & Solutions

### Challenge: Efficiently Traversing Large Commit Histories

**Solution:** Implemented incremental ingestion with `max_commits` limits, temporary directory cloning, and batch processing for embeddings. Used pygit2's native C bindings for performance.

### Challenge: Balancing Retrieval Accuracy and Performance

**Solution:** Implemented similarity thresholds tuned per granularity level, file exclusion patterns, and query result limiting. Used pgvector's HNSW indexes for sub-linear search complexity.

### Challenge: Designing Schema for Hybrid Search

**Solution:** Created a normalized schema with foreign key relationships while adding vector columns. Used SQLAlchemy's hybrid properties and custom query methods to seamlessly combine SQL and vector operations.

### Challenge: Visualizing Complex Git Histories

**Solution:** Implemented Dagre-based automatic layout with configurable directions. Used React Flow for interactive visualization with pan, zoom, and node selection. Optimized rendering with React memoization.

## Accomplishments

- Designed and implemented a scalable ingestion pipeline capable of processing entire repositories
- Integrated state-of-the-art RAG techniques with multi-level semantic search
- Created an intuitive, performant React interface with complex graph visualizations
- Deployed infrastructure-as-code with Terraform for reproducible AWS deployments
- Achieved sub-second query response times for semantic search across large codebases

## Future Enhancements

- **Multi-Repository Cross-Search:** Enable semantic search across multiple repositories for organization-wide context
- **PR-Level Summarization:** Aggregate commits into pull request summaries
- **Real-Time Sync:** GitHub/GitLab webhook integration for automatic repository updates
- **Advanced Graph Analytics:** Detect code patterns, refactoring trends, and architectural evolution
- **Collaborative Features:** Shared annotations, team knowledge bases, and code review integration
