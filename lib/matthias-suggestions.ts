/** Questions proposées au premier écran de Matthias, selon le rôle (fichier léger : envoyé au navigateur). */
export function matthiasSuggestions(role: string | null | undefined): string[] {
  if (role === 'formateur' || role === 'referent' || role === 'consultation')
    return [
      'Comment je remplis le tour de table ?',
      'Comment faire émarger mes stagiaires sur Digiforma ?',
      'Comment remplir la grille IRVE rapidement ?',
      'Un stagiaire doit partir plus tôt, je fais quoi ?',
      'Qu’est-ce que la plateforme reprend de Digiforma ?',
    ];
  return [
    'Lien formateur et QR codes d’émargement Digiforma : je fais comment ?',
    'Comment les sessions Digiforma arrivent sur le planning ?',
    'Qu’est-ce que la plateforme prend en compte depuis Digiforma ?',
    'Comment positionner une session sur le planning ?',
    'À quoi sert un évènement ?',
    'Où s’affiche une formation INTRA ou un samedi ?',
  ];
}
