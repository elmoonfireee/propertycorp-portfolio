import { cleanGoogleReviewText, createGoogleReviewsService, normalizeGoogleReview } from "../server/googleReviewsService.mjs";

export { cleanGoogleReviewText, normalizeGoogleReview };

export function createGoogleReviewsVercelHandler({ service = createGoogleReviewsService() } = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.status(405).end();
      return;
    }
    const result = await service.getResponse();
    Object.entries(result.headers).forEach(([name, value]) => response.setHeader(name, value));
    if (result.body == null) response.status(result.status).end();
    else response.status(result.status).json(result.body);
  }
}

export default createGoogleReviewsVercelHandler();
