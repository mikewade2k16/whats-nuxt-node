import { createError, getRouterParam } from "h3";
import { getProjectDocBySlug } from "../../utils/project-docs";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: "Slug do documento e obrigatorio."
    });
  }

  const doc = await getProjectDocBySlug(slug);

  if (!doc) {
    throw createError({
      statusCode: 404,
      statusMessage: "Documento nao encontrado."
    });
  }

  return doc;
});
