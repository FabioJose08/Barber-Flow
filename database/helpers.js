/**
 * Helpers de serialização entre dados do Firestore e o formato usado pelo app.
 *
 * O Firestore guarda Timestamps como objetos especiais; o memory-store e o
 * Firestore real retornam datas de formas diferentes. Centralizamos aqui a
 * conversão para strings ISO e a inclusão do campo `id` em cada documento.
 */

/**
 * Serializa um documento Firestore em objeto plano.
 * - Converte Timestamp/Date em string ISO (ex.: '2025-01-15T10:30:00.000Z')
 * - Adiciona o campo `id` com o id do documento
 *
 * @param {object} data - dados retornados pelo Firestore (doc.data())
 * @param {string} id - id do documento
 * @returns {object}
 */
function serializeDoc(data = {}, id = '') {
  const result = { id, ...data };

  Object.keys(result).forEach((key) => {
    let value = result[key];

    if (value !== null && typeof value === 'object') {
      // Firebase Timestamp (real) e nossos objetos Date
      if (typeof value.toDate === 'function') {
        value = value.toDate().toISOString();
      } else if (value instanceof Date) {
        value = value.toISOString();
      } else if (typeof value === 'object' && '_seconds' in value && '_nanoseconds' in value) {
        // Fallback para objetos de timestamp brutos
        value = new Date(value._seconds * 1000).toISOString();
      }
    }

    result[key] = value;
  });

  return result;
}

/**
 * Converte um documento em formato de resposta da API/app.
 * Aplica serializeDoc e garante que ids de usuários sejam strings.
 *
 * @param {object} doc - snapshot do Firestore
 * @returns {object}
 */
function docToApp(doc) {
  const data = doc.data() || {};
  return serializeDoc(data, doc.id);
}

/**
 * Converte uma lista de snapshots em array de objetos do app.
 *
 * @param {Array} docs - snapshots do Firestore
 * @returns {Array}
 */
function docsToApp(docs) {
  return docs.map(doc => docToApp(doc));
}

/**
 * Converte uma data ISO string (ex.: '2025-01-15T10:30') para um objeto Date
 * preservando o horário local. Usado nos formulários (datetime-local).
 *
 * @param {string} iso - string de data
 * @returns {Date}
 */
function parseDateTimeLocal(iso) {
  if (!iso) return null;
  return new Date(iso);
}

module.exports = {
  serializeDoc,
  docToApp,
  docsToApp,
  parseDateTimeLocal
};
