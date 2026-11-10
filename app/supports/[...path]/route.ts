import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { OFFICE_EXT, SUPPORT_BUCKET } from '@/lib/links';

/**
 * Fichiers des supports de cours (bucket privé « supports », migration 41) :
 * réservés aux comptes de l'équipe, ouverts via un lien signé de courte durée.
 * « ?ouvrir » : PowerPoint / Word / Excel affichés dans la visionneuse en ligne
 * de Microsoft (présentation en plein écran possible), sans rien télécharger.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const profile = await getCurrentProfile();
  if (!profile || profile.role === 'aucun') return NextResponse.redirect(new URL('/login', req.url));
  if (path.length !== 2 || !/^[0-9a-f-]{36}$/i.test(path[0]) || path.some((p) => p.includes('..'))) {
    return new NextResponse('Fichier introuvable.', { status: 404 });
  }
  let name: string;
  try {
    name = decodeURIComponent(path[1]);
  } catch {
    return new NextResponse('Fichier introuvable.', { status: 404 });
  }
  // Nom de fichier seul : jamais de dossier ni de remontée de chemin, même encodés.
  if (!name || /[\\/]/.test(name) || name.includes('..')) return new NextResponse('Fichier introuvable.', { status: 404 });
  const supabase = await createClient();
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (req.nextUrl.searchParams.has('ouvrir') && OFFICE_EXT.includes(ext)) {
    // La visionneuse lit le fichier depuis les serveurs Microsoft : lien signé d'une heure.
    const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(`${path[0]}/${name}`, 3600);
    if (error || !data?.signedUrl) return new NextResponse('Fichier introuvable.', { status: 404 });
    return NextResponse.redirect(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(data.signedUrl)}`);
  }
  const download = req.nextUrl.searchParams.has('telecharger') ? { download: name } : undefined;
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(`${path[0]}/${name}`, 300, download);
  if (error || !data?.signedUrl) return new NextResponse('Fichier introuvable.', { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
