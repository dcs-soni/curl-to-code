#!/usr/bin/env node
import {
  intro,
  text,
  spinner,
  note,
  outro,
  isCancel,
  cancel,
} from "@clack/prompts";
import chalk from "chalk";
import gradient from "gradient-string";
import { parseCurlOrUrl } from "./utils/curl-parser";
import { fetchNetworkData } from "./services/network";
import { generateCode } from "./services/generator";
import { renderResult } from "./ui/ResultViewer";

async function main() {
  console.clear();

  const welcomeText = `
     ______                __     ______          ______          __
    / ____/___  _________ / /    /_  __/___      / ____/___  ____/ /__
   / /   / __ \\/ ___/ __ \`/ /      / / / __ \\    / /   / __ \\/ __  / _ \\
  / /___/ /_/ / /  / /_/ / /      / / / /_/ /   / /___/ /_/ / /_/ /  __/
  \\____/\\____/_/   \\__,_/_/      /_/  \\____/    \\____/\\____/\\__,_/\\___/
  `;

  console.log(gradient.pastel(welcomeText));

  intro(chalk.bgCyan.black(" THE NETWORK-TO-CODE VISUALIZER "));

  const input = await text({
    message: "Enter a URL or cURL command to extract data from:",
    placeholder: 'curl https://api.example.com/data -H "Bearer token"',
    validate(value) {
      if (!value || value.trim().length === 0) return "Input is required";
    },
  });

  if (isCancel(input)) {
    cancel("Hologram extraction aborted.");
    process.exit(0);
  }

  const s = spinner();
  s.start("Parsing input and preparing network link");

  try {
    const requestConfig = parseCurlOrUrl(input as string);

    s.message(`Connecting to ${chalk.green(requestConfig.url)}`);
    const data = await fetchNetworkData(requestConfig);

    s.message("Crystallizing JSON payload into TypeScript and Zod schemas");
    const generated = generateCode(data);

    s.stop(`Extraction complete for ${chalk.green(requestConfig.url)}`);

    renderResult(data, generated);

    outro(gradient.pastel("Hologram generated successfully!"));
  } catch (error: any) {
    s.stop(chalk.red("Extraction failed"));
    note(chalk.redBright(error.message), "Error Details");
    process.exit(1);
  }
}

main().catch(console.error);
