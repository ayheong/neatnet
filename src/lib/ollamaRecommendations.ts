function parse_param_billions(name: string): number {
  const match = name.match(/(\d+(?:\.\d+)?)\s*b/i);
  return match ? Number.parseFloat(match[1]) : 0;
}

export type OllamaPullRecommendation = {
  /** `ollama pull` tag, e.g. `llama3.3:70b` */
  tag: string;
  title: string;
  approx_size_gb: number;
  blurb: string;
};

/**
 * Curated pulls for instruction-following + JSON (folder organize).
 * Ordered strongest-first among models most users can still run.
 * Ollama does not expose a “best model” API from the desktop app.
 */
export const OLLAMA_PULL_RECOMMENDATIONS: OllamaPullRecommendation[] = [
  {
    tag: "llama3.3:70b",
    title: "Llama 3.3 70B",
    approx_size_gb: 43,
    blurb: "Best quality for most people. Requires a powerful PC and about 43 GB of free space.",
  },
  {
    tag: "llama3.1:405b",
    title: "Llama 3.1 405B",
    approx_size_gb: 231,
    blurb: "Top tier, but huge—only try this if you have a very high-end machine.",
  },
  {
    tag: "llama3.1:70b",
    title: "Llama 3.1 70B",
    approx_size_gb: 40,
    blurb: "Still very capable if you want an alternative to Llama 3.3.",
  },
  {
    tag: "qwen2.5:32b",
    title: "Qwen 2.5 32B",
    approx_size_gb: 20,
    blurb: "Good middle ground if 70B models are too heavy for your computer.",
  },
  {
    tag: "llama3.1:8b",
    title: "Llama 3.1 8B",
    approx_size_gb: 5,
    blurb: "Smaller download; results may be less accurate on big folders.",
  },
];

export function get_primary_ollama_pull_recommendation(): OllamaPullRecommendation {
  return OLLAMA_PULL_RECOMMENDATIONS[0];
}

/** True if this exact tag (or same base + :latest) is already installed. */
export function is_ollama_tag_installed(installed: string[], tag: string): boolean {
  const [base, variant] = tag.includes(":") ? tag.split(":", 2) : [tag, "latest"];
  return installed.some((name) => {
    if (name === tag) return true;
    if (!name.includes(":")) return name === base;
    const [installed_base, installed_variant] = name.split(":", 2);
    if (installed_base !== base) return false;
    return installed_variant === variant || installed_variant === "latest";
  });
}

/** Suggest pulling a stronger model when nothing ~70B+ is installed. */
export function should_suggest_stronger_ollama_pull(installed: string[]): boolean {
  if (installed.length === 0) return true;
  const max_params = Math.max(0, ...installed.map(parse_param_billions));
  return max_params < 70;
}

export function format_ollama_pull_command(tag: string): string {
  return `ollama pull ${tag}`;
}
