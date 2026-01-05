/**
 * MCP Prompts implementation
 * Provides reusable prompt templates for common operations
 */

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

export interface McpGetPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

export interface McpListPromptsResult {
  prompts: McpPromptDefinition[];
}

// Prompt definitions
export const PROMPTS: McpPromptDefinition[] = [
  {
    name: "update_enterprise_to_version",
    description:
      "Guide for updating Dify Enterprise code repositories to a specific Helm chart version. Provides instructions on finding the correct commit SHA or release tag for each service.",
    arguments: [
      {
        name: "version",
        description: "Target Helm chart version (e.g., 3.7.0)",
        required: true,
      },
    ],
  },
  {
    name: "analyze_missing_images",
    description:
      "Analyze which Docker images are missing from the target registry for a specific version and provide remediation steps.",
    arguments: [
      {
        name: "version",
        description: "Helm chart version to analyze (e.g., 1.0.0)",
        required: true,
      },
    ],
  },
];

// Prompt template generators
const generateUpdateEnterprisePrompt = (version: string): McpGetPromptResult => {
  const promptText = `# Dify Enterprise Code Update Guide

## Target Version: ${version}

You need to update the Dify Enterprise codebase to match Helm chart version **${version}**. Follow these steps:

### Step 1: Retrieve Image Information

First, use the \`list_images\` tool to get all container images for version ${version}:

\`\`\`
Call: list_images with arguments: { "version": "${version}", "includeValidation": true }
\`\`\`

### Step 2: Identify Service Tags

The image tags in the Helm chart correspond to different code references depending on the service:

#### API Service (dify-api)
- **Tag format**: Git commit SHA (e.g., \`abc1234def5678\`)
- **Action**: Use this SHA to find the corresponding commit in the API repository
- **Command**: \`git checkout <commit-sha>\` or create a branch from it

#### Enterprise Service
- **Tag format**: Release tag (e.g., \`v${version}\` or \`${version}\`)
- **Action**: Checkout the matching release tag in the Enterprise repository
- **Command**: \`git checkout tags/<release-tag>\`

#### Other Services (web, worker, etc.)
- Check if the tag is a commit SHA or release tag
- For SHA tags: find and checkout the commit
- For version tags: checkout the corresponding release

### Step 3: Verify Alignment

After switching branches/tags:
1. Ensure all services are on compatible versions
2. Run integration tests if available
3. Build and test locally before deployment

### Step 4: Common Issues

- **Tag not found**: The image might use a different tagging convention. Check the image validation status.
- **Missing images**: Some images may not be available in the target registry. Use \`validate_images\` to check availability.
- **Version mismatch**: Ensure you're using the exact version string from the Helm chart.

---

**Tip**: Use the \`get_version_details\` tool to get the full chart URL and digest for verification.`;

  return {
    description: `Instructions for updating Dify Enterprise code to version ${version}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I need to update the Dify Enterprise codebase to Helm chart version ${version}. Please provide guidance on how to find the correct code versions for each service.`,
        },
      },
      {
        role: "assistant",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
};

const generateAnalyzeMissingImagesPrompt = (version: string): McpGetPromptResult => {
  const promptText = `# Missing Images Analysis for Version ${version}

I'll help you analyze which Docker images are missing from the target registry and suggest remediation steps.

## Analysis Steps

### Step 1: Get Validation Report

First, let me retrieve the image validation report:

\`\`\`
Call: validate_images with arguments: { "version": "${version}", "onlyMissing": true }
\`\`\`

### Step 2: Understanding the Results

The validation report shows:
- **status: ALL_FOUND** - Image exists with all architecture variants
- **status: PARTIAL** - Some architecture variants are missing (amd64/arm64)
- **status: MISSING** - Image not found in the target registry
- **status: ERROR** - Registry access error occurred

### Step 3: Remediation for Missing Images

For each missing image:

1. **Check source registry**: Verify the image exists in the original repository (Docker Hub, etc.)
2. **Pull and re-tag**: 
   \`\`\`bash
   docker pull <source-repository>:<tag>
   docker tag <source-repository>:<tag> <target-registry>/<image>:<tag>
   docker push <target-registry>/<image>:<tag>
   \`\`\`
3. **Multi-arch builds**: For architecture-specific tags, you may need to build for each platform

### Step 4: Partial Availability

If an image shows PARTIAL status but the ORIGINAL tag is FOUND:
- The image is usable (multi-arch manifest exists)
- Architecture-specific tags (-amd64, -arm64) are optional

---

**Note**: Use the \`list_images\` tool with \`includeValidation: true\` to see validation status alongside image paths in values.yaml.`;

  return {
    description: `Analysis of missing Docker images for Helm chart version ${version}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Which Docker images are missing for Helm chart version ${version}? How can I fix this?`,
        },
      },
      {
        role: "assistant",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
};

// Get prompt by name with arguments
export const getPrompt = (
  name: string,
  args: Record<string, string>,
): McpGetPromptResult | null => {
  switch (name) {
    case "update_enterprise_to_version": {
      const version = args.version;
      if (!version) {
        return null;
      }
      return generateUpdateEnterprisePrompt(version);
    }
    case "analyze_missing_images": {
      const version = args.version;
      if (!version) {
        return null;
      }
      return generateAnalyzeMissingImagesPrompt(version);
    }
    default:
      return null;
  }
};

// List all prompts
export const listPrompts = (): McpListPromptsResult => {
  return {
    prompts: PROMPTS,
  };
};

