export async function preloadTemplates(): Promise<Handlebars.TemplateDelegate[]> {
  const templatePaths: string[] = [
    // Add paths to "modules/foundry-module-template/templates"
  ];

  return loadTemplates(templatePaths);
}
