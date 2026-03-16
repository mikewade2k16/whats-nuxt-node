import { promises as fs } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { createError } from "h3";

export type ProjectDocStatus = "none" | "todo" | "in_progress" | "done";
export type ProjectDocPriority = "P0" | "P1" | "P2";

export type ProjectDocChecklistStats = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  completionPercent: number | null;
  status: ProjectDocStatus;
};

export type ProjectDocChecklistItem = {
  text: string;
  status: Exclude<ProjectDocStatus, "none">;
  priority: ProjectDocPriority | null;
};

export type ProjectDocSectionStats = {
  title: string;
  level: number;
  checklist: ProjectDocChecklistStats;
  items: ProjectDocChecklistItem[];
};

export type ProjectDocPriorityStats = Record<ProjectDocPriority, ProjectDocChecklistStats>;

export type ProjectDocSummary = {
  slug: string;
  fileName: string;
  path: string;
  title: string;
  updatedAt: string;
  checklist: ProjectDocChecklistStats;
  sections: ProjectDocSectionStats[];
  priorities: ProjectDocPriorityStats;
};

export type ProjectDocDetails = ProjectDocSummary & {
  content: string;
};

const PRIORITY_ORDER = ["README.md", "backlog-execucao.md", "scorecard-arquitetura.md", "roadmap-whatsapp-parity.md"];

type ChecklistCounter = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
};

function slugify(fileName: string) {
  return fileName
    .replace(/\.md$/i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function extractTitle(content: string, fileName: string) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match?.[1]) {
    return match[1].trim();
  }

  return basename(fileName, extname(fileName));
}

function resolveChecklistStatus(stats: Omit<ProjectDocChecklistStats, "status">): ProjectDocStatus {
  if (stats.total === 0) {
    return "none";
  }

  if (stats.pending === 0 && stats.inProgress === 0) {
    return "done";
  }

  if (stats.inProgress > 0 || stats.completed > 0) {
    return "in_progress";
  }

  return "todo";
}

function createEmptyChecklistCounter(): ChecklistCounter {
  return {
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0
  };
}

function toChecklistStats(counter: ChecklistCounter): ProjectDocChecklistStats {
  const weightedDone = counter.completed + counter.inProgress * 0.5;
  const completionPercent = counter.total > 0 ? Math.round((weightedDone / counter.total) * 100) : null;
  return {
    total: counter.total,
    completed: counter.completed,
    inProgress: counter.inProgress,
    pending: counter.pending,
    completionPercent,
    status: resolveChecklistStatus({
      total: counter.total,
      completed: counter.completed,
      inProgress: counter.inProgress,
      pending: counter.pending,
      completionPercent
    })
  };
}

function applyChecklistMarker(counter: ChecklistCounter, marker: string) {
  counter.total += 1;
  if (marker === "x" || marker === "X") {
    counter.completed += 1;
    return;
  }

  if (marker === "~" || marker === "-") {
    counter.inProgress += 1;
    return;
  }

  counter.pending += 1;
}

function resolveChecklistItemStatus(marker: string): Exclude<ProjectDocStatus, "none"> {
  if (marker === "x" || marker === "X") {
    return "done";
  }

  if (marker === "~" || marker === "-") {
    return "in_progress";
  }

  return "todo";
}

function detectPriority(text: string): ProjectDocPriority | null {
  const match = text.match(/(?:\[(P0|P1|P2)\]|\((P0|P1|P2)\)|\b(P0|P1|P2)\b)/i);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!value) {
    return null;
  }

  const normalized = value.toUpperCase();
  if (normalized === "P0" || normalized === "P1" || normalized === "P2") {
    return normalized;
  }

  return null;
}

function parseChecklistData(content: string): {
  checklist: ProjectDocChecklistStats;
  sections: ProjectDocSectionStats[];
  priorities: ProjectDocPriorityStats;
} {
  const headingRegex = /^(#{2,4})\s+(.+)$/;
  const checklistRegex = /^\s*(?:[-*+]|\d+\.)\s+(?:`)?\[([ xX~-])\](?:`)?\s+(.+)$/;

  const totalCounter = createEmptyChecklistCounter();
  const priorityCounters: Record<ProjectDocPriority, ChecklistCounter> = {
    P0: createEmptyChecklistCounter(),
    P1: createEmptyChecklistCounter(),
    P2: createEmptyChecklistCounter()
  };

  const sectionCounters: Array<{
    title: string;
    level: number;
    counter: ChecklistCounter;
    items: ProjectDocChecklistItem[];
  }> = [];
  let currentSectionIndex = -1;

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      sectionCounters.push({
        title: headingMatch[2].trim(),
        level: headingMatch[1].length,
        counter: createEmptyChecklistCounter(),
        items: []
      });
      currentSectionIndex = sectionCounters.length - 1;
      continue;
    }

    const checklistMatch = line.match(checklistRegex);
    if (!checklistMatch) {
      continue;
    }

    const marker = checklistMatch[1];
    const itemText = checklistMatch[2];

    applyChecklistMarker(totalCounter, marker);

    if (currentSectionIndex >= 0) {
      applyChecklistMarker(sectionCounters[currentSectionIndex].counter, marker);
    }

    const priority = detectPriority(itemText);
    if (priority) {
      applyChecklistMarker(priorityCounters[priority], marker);
    }

    if (currentSectionIndex >= 0) {
      sectionCounters[currentSectionIndex].items.push({
        text: itemText.trim(),
        status: resolveChecklistItemStatus(marker),
        priority
      });
    }
  }

  return {
    checklist: toChecklistStats(totalCounter),
    sections: sectionCounters
      .filter((sectionEntry) => sectionEntry.counter.total > 0)
      .map((sectionEntry) => ({
        title: sectionEntry.title,
        level: sectionEntry.level,
        checklist: toChecklistStats(sectionEntry.counter),
        items: sectionEntry.items
      })),
    priorities: {
      P0: toChecklistStats(priorityCounters.P0),
      P1: toChecklistStats(priorityCounters.P1),
      P2: toChecklistStats(priorityCounters.P2)
    }
  };
}

async function pathIsDirectory(pathValue: string) {
  try {
    const stat = await fs.stat(pathValue);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveDocsRoot() {
  const explicitRoot = process.env.PROJECT_DOCS_DIR;

  const candidates = [
    explicitRoot,
    "/project-docs",
    "/docs",
    resolve(process.cwd(), "../../docs"),
    resolve(process.cwd(), "../docs"),
    resolve(process.cwd(), "docs")
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await pathIsDirectory(candidate)) {
      return candidate;
    }
  }

  throw createError({
    statusCode: 500,
    statusMessage:
      "Diretorio de docs nao encontrado. Defina PROJECT_DOCS_DIR ou monte ./docs no container web."
  });
}

type RawDocRecord = {
  slug: string;
  fileName: string;
  title: string;
  updatedAt: string;
  content: string;
  checklist: ProjectDocChecklistStats;
  sections: ProjectDocSectionStats[];
  priorities: ProjectDocPriorityStats;
};

function sortDocs(a: RawDocRecord, b: RawDocRecord) {
  const indexA = PRIORITY_ORDER.indexOf(a.fileName);
  const indexB = PRIORITY_ORDER.indexOf(b.fileName);

  if (indexA !== -1 || indexB !== -1) {
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  }

  return a.fileName.localeCompare(b.fileName, "pt-BR");
}

async function loadRawDocs() {
  const docsRoot = await resolveDocsRoot();
  const entries = await fs.readdir(docsRoot, { withFileTypes: true });
  const markdownFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"));

  const docs = await Promise.all(
    markdownFiles.map(async (fileEntry) => {
      const filePath = resolve(docsRoot, fileEntry.name);
      const [content, stat] = await Promise.all([fs.readFile(filePath, "utf-8"), fs.stat(filePath)]);

      return {
        slug: slugify(fileEntry.name),
        fileName: fileEntry.name,
        title: extractTitle(content, fileEntry.name),
        updatedAt: stat.mtime.toISOString(),
        content,
        ...parseChecklistData(content)
      } satisfies RawDocRecord;
    })
  );

  return {
    docsRoot,
    docs: docs.sort(sortDocs)
  };
}

export async function listProjectDocs(): Promise<ProjectDocSummary[]> {
  const { docs } = await loadRawDocs();

  return docs.map((docEntry) => ({
    slug: docEntry.slug,
    fileName: docEntry.fileName,
    path: `docs/${docEntry.fileName}`,
    title: docEntry.title,
    updatedAt: docEntry.updatedAt,
    checklist: docEntry.checklist,
    sections: docEntry.sections,
    priorities: docEntry.priorities
  }));
}

export async function getProjectDocBySlug(slug: string): Promise<ProjectDocDetails | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  const { docs } = await loadRawDocs();
  const docEntry = docs.find((entry) => entry.slug === normalizedSlug);

  if (!docEntry) {
    return null;
  }

  return {
    slug: docEntry.slug,
    fileName: docEntry.fileName,
    path: `docs/${docEntry.fileName}`,
    title: docEntry.title,
    updatedAt: docEntry.updatedAt,
    checklist: docEntry.checklist,
    sections: docEntry.sections,
    priorities: docEntry.priorities,
    content: docEntry.content
  };
}
