interface WindowEventMap {
  "minifeel:plugin-installed": CustomEvent<{ type: "node" | "tool" | "skill" | "agent"; name: string }>;
}
