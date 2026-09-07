/**
 * The async boundary.
 *
 * Federated `shared` modules resolve asynchronously: the runtime has to
 * negotiate which copy of React wins before any module that imports React is
 * evaluated. An entry that imports React statically is evaluated too early and
 * fails with "Invalid loadShareSync function call".
 *
 * So the entry stays deliberately thin - one dynamic import and nothing else.
 * Everything that touches React lives behind it in bootstrap.tsx.
 */

void import('./bootstrap.tsx');
