# ScholarPath Chatbot Flow

## Goal

The chatbot supports two main user needs:

1. **Information and guidance**
   The student asks about concepts, documents, certificates, timelines, tests, visas, SOPs, recommendation letters, or application steps.

2. **Personalized matching**
   The student wants scholarships or study options that match their profile, destination, degree level, field, and funding needs.

The system should prefer **local grounded knowledge first**, then use **web search only when necessary** for fresh or missing information.

## Routing Strategy

Each chat turn goes through four stages:

1. **Intent classification**
   The backend classifies the latest user need into one of:
   - `concept_explainer`
   - `application_guidance`
   - `personalized_matching`
   - `latest_info`

2. **Profile extraction**
   The backend extracts planning state from the conversation:
   - degree target
   - preferred country or region
   - field of study
   - nationality
   - funding preference
   - test scores if mentioned
   - confusion areas
   - missing fields
   - specificity level

3. **Source selection**
   The backend decides which source to use:
   - **Knowledge base / RAG path** for concepts and process guidance
   - **Scholarship DB ranking path** for personalized recommendations
   - **Web search fallback** for fresh, official, or time-sensitive information

4. **Response generation**
   The backend generates a structured response with:
   - phase: `ask_more`, `guide`, or `recommend`
   - assistant message
   - optional follow-up question
   - optional scholarship IDs
   - optional next steps

## Source Priority

### 1. Local Knowledge Base

Use first for:

- SOP / personal statement questions
- recommendation letters
- IELTS / TOEFL guidance
- common application documents
- application timelines
- visa basics
- country choice
- admission vs scholarship workflow

Benefits:

- faster
- cheaper
- more controllable
- consistent tone

### 2. Scholarship Database

Use for personalized matching.

Flow:

1. extract student profile
2. check if profile is specific enough
3. score scholarships from the local database
4. allow the model to recommend only from the validated shortlist

Benefits:

- prevents hallucinated scholarship recommendations
- keeps outputs grounded
- makes roadmap generation reliable

### 3. Web Search Fallback

Use only when the answer is likely to change or local data is insufficient.

Examples:

- current deadlines
- latest visa rules
- updated English requirements
- official university or scholarship updates

Rules:

- prefer official sources
- give a practical answer first
- include source links

## Behavior Rules

### If the student is vague

The chatbot should:

- explain what is still unclear
- ask exactly one focused follow-up question
- avoid giving premature recommendations

Example:

> I can help with that. To narrow the best options, which country or region are you most interested in?

### If the student asks a concept question

The chatbot should:

- answer directly using local knowledge
- keep the answer practical
- optionally suggest the next useful step

Example:

> `SOP` means Statement of Purpose. It explains your goals, your background, and why you fit the program.

### If the student asks a process question

The chatbot should:

- answer with a checklist or step-by-step explanation
- mention where requirements commonly differ
- ask one follow-up question if needed

Example:

> Common documents usually include transcripts, passport, CV, SOP, recommendation letters, and an English test score if required.

### If the student asks for matching

The chatbot should:

- use profile extraction
- verify enough specificity
- rank local scholarships
- recommend only validated IDs

## Current Implementation Shape

### Backend route

`app/api/chat/route.ts`

Main modules inside the route:

- intent extraction
- profile extraction
- local knowledge retrieval
- scholarship shortlist scoring
- web-search fallback generation
- response validation
- chat session storage

### Knowledge base

`lib/study-abroad-knowledge.ts`

This stores local guidance chunks for study abroad concepts and process questions.

### Scholarship grounding

`lib/scholarships.ts`

This remains the source of truth for scholarship recommendations.

### Session storage

`data/chat-sessions.json`

This stores:

- messages
- extracted profile
- intent
- retrieved knowledge IDs
- shortlist IDs
- final recommendations

## Recommended Next Upgrades

1. Move the knowledge base into a larger markdown or JSON corpus and chunk it more systematically.
2. Add embeddings-based retrieval instead of keyword scoring.
3. Store source provenance in the saved session.
4. Add UI badges such as `From Knowledge Base`, `From Scholarship DB`, and `Live Web`.
5. Show official source links in a dedicated source panel instead of only inline text.
