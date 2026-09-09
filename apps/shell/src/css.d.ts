/**
 * Stylesheets are imported for their side effect: the bundler extracts them and
 * links them into the document. They export nothing, so this only tells
 * TypeScript the modules exist.
 */
declare module '*.css';
