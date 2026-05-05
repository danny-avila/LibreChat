---
name: kaleidoscope-assignment-generation
description: |
  Use this skill when a teacher, counselor, or administrator asks you to
  generate, create, design, or structure a student assignment, lesson plan,
  worksheet, therapeutic activity, or assessment. Contains the SCBF
  Therapeutic Activity Assignment Library, therapeutic goal taxonomy,
  assignment index, and detailed entries that should drive activity
  selection and personalization. Includes the two-part output structure
  (educator lesson plan + clean student-facing document).
---

# SCBF Therapeutic Activity Assignment Library

St. Clair Butterfly Foundation -- Version 1.0

## Top-level instructions (always read first)

This library is the source for therapeutic activity generation. The library is split across multiple reference files; read only the files relevant to the current request.

**TWO-PART OUTPUT REMINDER:** Every generated lesson plan is a single document with two parts separated by a page break. Part 1 is the full educator lesson plan. Part 2 is the clean student-facing document — no therapeutic framing, no clinical language, no DOK levels. Part 2 language is age-calibrated to the specific student.

The Therapeutic Framing field in each assignment entry shapes how you personalize the activity — preserve its essence while adapting for the specific student. **Do NOT reproduce Therapeutic Framing verbatim in any output.** Educator documentation, assessment criteria, and lesson plan structure are handled by the lesson plan template.

## How to navigate this skill

You are inside a code-execution container. The reference files for this skill live alongside this `SKILL.md` and you can read them with `bash` or the file editor (`cat <filename>`). **Read only the files relevant to the user's current request — do not read all of them.**

Decision guide:

| If the user is asking about... | Read this file |
|---|---|
| Mapping educator language to therapeutic goals; selecting goals; or generating gap activities | `01-goals-taxonomy.md` |
| Browsing the catalog of available assignments by category | `02-assignment-index.md` |
| Generating any **writing** assignment (stories, narrative, journaling) | `03-creative-writing.md` |
| Generating any **art / visual** assignment (drawing, sculpture, mixed media) | `04-art.md` |
| Generating any **music** assignment (rhythm, percussion, songwriting) | `05-music.md` |
| Generating any **gardening** assignment (plant care, growing projects) | `06-gardening.md` |
| Running an **educator-led mindful stretching session** (movement + narrative) | `07-mindful-stretching.md` |
| Adding new assignments to the library or updating existing ones (rare) | `08-maintenance.md` |

Most assignment-generation requests need **at most two files**: typically `01-goals-taxonomy.md` (to select the right therapeutic goal) and one of the category files (to select and personalize the activity).

If a request crosses categories (e.g., "an assignment for an anxious student who likes both writing and music"), read the relevant category files and present the educator with options.

## Output

Once you have selected and personalized an activity from a category file, generate the two-part document directly. Use the `docx` skill for Word output or the `pdf` skill for PDF, depending on the user's request.

Do NOT mention "skills", "skill files", "SKILL.md", or any internal mechanics in your response to the user. The file output is the primary deliverable.
