import type { FormEvent } from 'react';

/**
 * Envoi d'un formulaire sans la remise à zéro automatique de React 19
 * (« <form action> ») : les champs gardent ce qui vient d'être enregistré,
 * et la saisie n'est pas perdue en cas d'erreur.
 */
export function submitWith(fn: (fd: FormData) => unknown) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fn(new FormData(e.currentTarget));
  };
}
