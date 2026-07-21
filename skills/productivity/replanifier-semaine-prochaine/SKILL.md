---
name: replanifier-semaine-prochaine
description: Analyse les activites de la semaine prochaine depuis Salesforce (RDVs, opportunites, taches), detecte les conflits et propose une replanification priorisee.
disable-model-invocation: true
---

# Replanifier Semaine Prochaine

## Instructions

Objectif: revoir la semaine prochaine et produire un plan court, actionnable, sans depasser la taille de reponse.

Donnees attendues Salesforce:
- RDVs (date/heure, duree, client, type, statut)
- Opportunites (montant, probabilite, stage, close date, prochaine action)
- Taches (due date, priorite, statut, owner, lien compte/opportunite)

Si une donnee manque, le signaler puis continuer avec les champs disponibles.

Workflow:
1) Cadrer la plage de travail (fuseau, jours travailles, horaires cibles, contraintes fixes).
2) Extraire les activites de la semaine prochaine dans 3 listes: `rdvs[]`, `opportunites[]`, `taches[]`.
3) Detecter conflits et surcharge (chevauchements, depassements de capacite, echeances proches, opportunites sans next step).
4) Scorer les priorites (0-100):
   - Impact business opportunite: 0-35
   - Urgence echeance: 0-25
   - Engagement client: 0-20
   - Risque inaction: 0-20
5) Construire un agenda cible par jour avec blocs RDVs, suivi opportunites prioritaires, traitement taches critiques, et 10-15% de marge pour imprevus.
6) Proposer des actions concretes:
   - Replanifier les RDVs en conflit vers un nouveau slot (date/heure proposee + raison).
   - Reaffecter des taches non critiques a des membres d'equipe disponibles.
   - Escalader les opportunites critiques si le owner actuel est surcharge.
7) Valider les arbitrages avec l'utilisateur (RDVs a deplacer, taches a reassigner, top 3 opportunites a proteger).
8) Produire le plan final et les actions Salesforce a appliquer.

Contraintes:
- Pas de double booking.
- Ne pas decaler un engagement client sans alternative explicite.
- Prioriser l'echeance la plus proche en cas d'egalite.
- Reserver au moins 1 bloc quotidien pour relances pipeline.
- Limiter la sortie a l'essentiel (format court ci-dessous).
- Ne produire aucun paragraphe libre hors format.
- Commencer par les actions, pas par l'analyse.
- Ne pas afficher de section "observations" avant le tableau.
- Chaque action doit inclure quoi, qui, quand, pourquoi.

Format de sortie (tableau Markdown, compact, action-first):

| Priorite | Type | Element | Action a executer | Cible | Echeance/Slot | Impact attendu |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Opportunite | <opportunite #1> | <next step concret> | <owner> | <due> | <gain/risque evite> |
| P2 | Opportunite | <opportunite #2> | <next step concret> | <owner> | <due> | <gain/risque evite> |
| P3 | Opportunite/Tache | <element #3> | <action concrete> | <owner> | <due> | <gain/risque evite> |
| M1 | RDV | <rdv #1> | Replanifier | <owner/client> | <ancien -> nouveau slot> | <conflit resolu> |
| M2 | RDV | <rdv #2> | Replanifier | <owner/client> | <ancien -> nouveau slot> | <conflit resolu> |
| M3 | RDV | <rdv #3> | Replanifier | <owner/client> | <ancien -> nouveau slot> | <surcharge reduite> |
| D1 | Delegation | <tache #1> | Reassigner/Reporter | <nouvel owner> | <date cible> | <temps libere> |
| D2 | Delegation | <tache #2> | Reassigner/Reporter | <nouvel owner> | <date cible> | <retard evite> |
| D3 | Delegation | <tache #3> | Reassigner/Reporter | <nouvel owner> | <date cible> | <retard evite> |
| R1 | Risque | <risque critique restant> | Surveiller + mitigation | <owner> | <prochaine revue> | <impact si non traite> |
| V1 | Validation | Decision utilisateur | Confirmer O/N | <toi> | <maintenant> | <go/no-go execution> |

Regles de sortie:
- Sortie uniquement en tableau Markdown.
- Maximum 11 lignes de donnees (hors en-tete).
- Si une ligne est non applicable, remplir avec `Aucun`.
- Champs courts et concrets; pas de paragraphe libre.
- Pas d'introduction avant le tableau.
- Privilegier les verbes d'action: Replanifier, Reassigner, Mettre a jour, Cloturer, Escalader.
- Utiliser des emojis pour compacter et accelerer la lecture.

Legendes emoji (obligatoires):
- Priorite: `🔴` critique, `🟠` haute, `🟡` moyenne
- Type: `💼` opportunite, `📅` rdv, `🧩` delegation, `⚠️` risque, `✅` validation
- Action: `📌` mettre a jour, `🔁` replanifier, `👥` reassigner, `🗂️` cloturer, `⬆️` escalader
- Impact: `💰` gain, `🛡️` risque evite, `⏱️` temps libere

Format court recommande par cellule:
- `Priorite`: `<emoji> P1/P2/P3`
- `Type`: `<emoji> + mot-cle`
- `Action a executer`: `<emoji> verbe + objet (court)`
- `Impact attendu`: `1 emoji + 2-5 mots`
