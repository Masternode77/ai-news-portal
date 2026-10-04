import { fixtureArticle, essayBody } from './authored-column-fixture.mjs';
import { createExtractionArtifact } from '../../scripts/lib/extraction-artifact.mjs';

export function artworkSource() {
  const source = fixtureArticle();
  source.extraction_artifact = createExtractionArtifact({
    sourceUrl: source.sourceUrl, cleanedExtractedText: source.articleText,
    extractionQa: { ...source.extraction_qa, sentence_completion_score: 1 },
  });
  return source;
}

export function artworkColumn() {
  const source = artworkSource();
  const additional = [
    'A procurement committee should therefore ask which commitments survive a delayed handover. I would separate the equipment purchase order from the service commencement date and examine the remedies attached to each. A supplier can deliver servers on time while the building still lacks accepted electrical protection. That is not the same failure as a missed server shipment, and the contracts should not obscure the distinction. My preference would be to place the physical commissioning evidence beside the commercial acceptance language before approving another purchase order.',
    'The operating team also needs a clear responsibility map. Someone must coordinate the utility test schedule with the facility commissioning plan, and someone must decide when the tenant can begin its own acceptance work. If those responsibilities are split across organizations, I would want the escalation route agreed before a delay occurs. This is an inference about execution risk, not a claim that Northline has failed a test. The available coverage describes reserved equipment and remaining acceptance work; it does not provide the signed contracts or the complete test programme.',
    'For investors, the distinction changes the questions worth asking management. I would look for evidence that the stated energization target is connected to executable purchase orders, completed design work and a utility acceptance plan. A confident presentation alone would not settle the issue. Equally, a missing public detail is not proof that the project lacks that detail internally. The investment question remains conditional on disclosure and delivery, and I would avoid turning an information gap into a factual accusation about the developer.',
    'The next meaningful update would join the commercial and engineering accounts of the project. An announced tenant commitment is useful, but an account of the remaining commissioning dependencies would make the delivery story more testable. I would update my view if the utility and developer describe consistent milestones and then meet them. Until then, the useful distinction is between a contracted ambition and accepted operating capacity. Buyers should evaluate that distinction against their own tolerance for delayed service rather than assume every announced campus has the same execution profile.',
  ].join('\n\n');
  return {
    id: 'col-artwork-fixture', content_origin: 'authored', slug: 'artwork-fixture',
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and I think the anchor tenant just bought schedule risk that is priced as energy risk.',
    summary: 'A grid delivery assessment.',
    expertLensFull: { finalArticleBody: `${essayBody()}\n\n${additional}` },
    based_on_article_ids: [source.id], sources: [{ url: source.sourceUrl }],
    figures: [{ type: 'table', title: 'Contract milestones', items: [] }],
    authored_quality: { ok: true }, imageProvider: 'codex', imageStatus: 'queued',
  };
}
