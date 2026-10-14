import { DOC_SELECT, DOC_SIG_SELECT, type DocSignature, type SignableDoc } from '@/lib/documents';

type Client = { from: (t: string) => any; storage: any };

/** Documents à signer (vide si la migration 28 n'est pas faite). */
export async function loadDocs(client: Client): Promise<SignableDoc[]> {
  const { data, error } = await client.from('signable_documents').select(DOC_SELECT).order('position');
  return error ? [] : ((data as SignableDoc[]) || []);
}

export async function loadDocSignatures(client: Client, col: 'trainee_id' | 'employee_id', ids: string[]): Promise<DocSignature[]> {
  if (!ids.length) return [];
  const out: DocSignature[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await client.from('document_signatures').select(DOC_SIG_SELECT).in(col, ids.slice(i, i + 200));
    if (error) return [];
    out.push(...((data as DocSignature[]) || []));
  }
  return out;
}

/** Liens temporaires (1 h) vers les PDF déposés, pour les lire avant de signer. */
export async function docUrls(client: Client, docs: SignableDoc[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    docs
      .filter((d) => d.storage_path)
      .map(async (d) => {
        const { data } = await client.storage.from('dossiers').createSignedUrl(d.storage_path, 3600);
        if (data?.signedUrl) out[d.id] = data.signedUrl;
      })
  );
  return out;
}
