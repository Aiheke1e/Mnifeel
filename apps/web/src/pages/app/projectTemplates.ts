import { IconBulb, IconHeart, IconShoppingBag } from "@tabler/icons-vue";

export const projectTemplates = [
  {
    id: "freeStory",
    name: "自由创作",
    description: "从一个想法开始，按自己的节奏完成故事、画面和视频。",
    icon: IconBulb,
    accent: "#6366f1",
  },
  {
    id: "emotionalStory",
    name: "情感短篇",
    description: "适合人物关系、生活片段和情绪转折明确的短故事。",
    icon: IconHeart,
    accent: "#ec4899",
  },
  {
    id: "productStory",
    name: "产品故事",
    description: "围绕一个产品卖点，组织场景、人物和展示节奏。",
    icon: IconShoppingBag,
    accent: "#0ea5e9",
  },
] as const;
