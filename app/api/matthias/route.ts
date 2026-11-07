import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/supabase/server';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { MATTHIAS_SYSTEM } from '@/lib/matthias-knowledge';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/*
 * Matthias bot : assistant de la plateforme pour toute l'équipe connectée.
 * La clé ANTHROPIC_API_KEY est lue côté serveur (variable Vercel) et n'est
 * jamais envoyée au navigateur. Réponse renvoyée en direct (texte brut).
 */

const MAX_TURNS = 20; // derniers messages gardés
const MAX_CHARS = 4000; // par message
const PER_MINUTE = 15; // questions par personne et par minute

const hits = new Map<string, number[]>();
function tooMany(userId: string) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(userId, list);
  return list.length > PER_MINUTE;
}

type Turn = { role: 'user' | 'assistant'; text: string };

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === 'aucun') return new Response('Connecte-toi pour utiliser Matthias.', { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('Matthias n’est pas encore activé (clé ANTHROPIC_API_KEY à ajouter dans Vercel).', { status: 503 });
  if (tooMany(profile.id)) return new Response('Doucement 🙂 trop de questions d’un coup, réessaie dans une minute.', { status: 429 });

  let body: { messages?: Turn[]; page?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Requête illisible.', { status: 400 });
  }
  const turns = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return new Response('Pose ta question.', { status: 400 });

  // Contexte de la personne (rôle, page ouverte) : ajouté à sa dernière question, pas au texte fixe (mis en cache).
  const role = ROLE_LABELS[profile.role as Role] || profile.role;
  const page = String(body.page || '').slice(0, 120);
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t, i) => ({
    role: t.role,
    content:
      i === turns.length - 1
        ? `[Contexte : ${profile.full_name ? `${profile.full_name}, ` : ''}rôle « ${role} »${page ? `, page ouverte : ${page}` : ''}]\n\n${t.text}`
        : t.text,
  }));

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const run = client.beta.messages.stream({
          model: 'claude-opus-5-5',
          max_tokens: 8000,
          // Questions d'usage : effort bas, réponses rapides.
          output_config: { effort: 'low' },
          // Refus d'un filtre de sécurité : la demande est reprise par le modèle recommandé.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: MATTHIAS_SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages,
        });
        for await (const event of run) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') controller.enqueue(encoder.encode(event.delta.text));
        }
        const final = await run.finalMessage();
        if (final.stop_reason === 'refusal')
          controller.enqueue(encoder.encode('\n\nJe ne peux pas répondre à cette demande. Reformule ta question sur l’utilisation de la plateforme, ou demande à Martial.'));
        else if (final.stop_reason === 'max_tokens') controller.enqueue(encoder.encode('\n\n(Réponse coupée : demande-moi la suite.)'));
      } catch (e) {
        const msg =
          e instanceof Anthropic.RateLimitError
            ? 'Matthias est très sollicité, réessaie dans un instant.'
            : e instanceof Anthropic.AuthenticationError
              ? 'Matthias n’est pas correctement activé (clé à vérifier dans Vercel).'
              : 'Matthias n’a pas pu répondre, réessaie.';
        controller.enqueue(encoder.encode(`\n\n${msg}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
