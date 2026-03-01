import { listProjectDocs } from "../../utils/project-docs";

export default defineEventHandler(async () => {
  const docs = await listProjectDocs();

  return {
    docs
  };
});
