import Link from 'next/link';
import { FileSignature } from 'lucide-react';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { NameForm, PasswordForm } from '@/components/profile-forms';

export default async function ProfilPage() {
  const profile = await getCurrentProfile();
  // Documents salarié (migration 25) : droit à l'image, remise de matériel.
  const supabase = await createClient();
  const { data: me } = profile
    ? await supabase.from('employees').select('token, employee_documents(signed_at)').eq('profile_id', profile.id).eq('active', true).maybeSingle()
    : { data: null };
  const toSign = (((me as any)?.employee_documents as any[]) || []).filter((d) => !d.signed_at).length;

  return (
    <main>
      <Sidebar active="/profil" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Mon compte</p>
            <h1>Mon profil</h1>
            <p>Gère ton nom et ton mot de passe.</p>
          </div>
        </header>

        {me && (
          <div role="status" className={`alert ${toSign ? 'alert-warning' : 'alert-success'}`}>
            <FileSignature size={16} aria-hidden style={{ verticalAlign: '-3px' }} />{' '}
            {toSign ? `${toSign} document${toSign > 1 ? 's' : ''} à signer (droit à l’image, matériel).` : 'Tes documents salarié sont signés.'}{' '}
            <Link href={`/salarie/${(me as any).token}`}>{toSign ? 'Signer maintenant' : 'Voir mes documents'}</Link>
          </div>
        )}

        <NameForm fullName={profile?.full_name || ''} />
        <PasswordForm />
      </section>
    </main>
  );
}
