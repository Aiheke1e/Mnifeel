/// <reference path="./types.d.ts" />

import deepSeek from "./src/language/deepSeek";

export type Provider = ProviderDefinition;
export type ProviderTools = ProviderContext["tool"];
export type AudioConvertOptions = Parameters<ProviderTools["audio"]["convert"]>[1];
export type { FfmpegFactory, FfmpegCommand } from "@minifeel/ffmpeg/types";

export const languageProviders = [deepSeek] as const;
export const mediaProviders = [] as const;
