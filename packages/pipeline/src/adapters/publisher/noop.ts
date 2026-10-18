/** No-op site publisher for dry runs: validates the row, writes nothing, returns the would-be URL. */
import { PublicationInsert } from "@cc/shared";
import type { PublisherAdapter, PublishResult, StageContext } from "@cc/shared";

export function createNoopPublisher(options: { baseUrl: string }): PublisherAdapter {
  return {
    target: "site",
    async publish(item, ctx: StageContext): Promise<PublishResult> {
      const row = PublicationInsert.parse(item);
      ctx.logger.info("noop publisher: would publish", { slug: row.slug, content_type: row.content_type });
      return { slug: row.slug, url: `${options.baseUrl.replace(/\/$/, "")}/${row.slug}/` };
    },
  };
}
