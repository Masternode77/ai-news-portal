export function isLocalHomepageBlog(article = {}) {
  const route = String(article.blog_route || article.publishing_route || article.route || '').toLowerCase();
  return Boolean(
    article.id
      && article.homepagePublished !== false
      && article.articlePagePublished !== false
      && article.archiveOnly !== true
      && article.noindex !== true
      && !article.signalCardOnly
      && /core_longform_blog|standard_blog|core longform blog|standard blog/.test(route)
  );
}

export function homepageLocalBlogCount(items = []) {
  return items.filter(isLocalHomepageBlog).length;
}
