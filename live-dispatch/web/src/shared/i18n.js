/* English → French (Canadian) for all three apps.
   Works on the page itself: every piece of text (ours and the server's) is translated as it appears,
   so new screens and messages are covered without touching each component.
   Exact phrases come from FR; sentences with times, numbers and addresses from RULES. Unknown text stays English. */

const FR = {
  // shared / headers
  "Live Dispatch": "Répartition en direct", "Prototype": "Prototype", "Live": "En direct", "Offline": "Hors ligne",
  "Live dispatch": "Répartition en direct", "Manual vs our system": "Manuel vs notre système",
  "Sep 29 replay": "Rejeu du 29 sept.", "stands in for Samsara": "remplace Samsara", "Tue Sep 29 (replay)": "mar. 29 sept. (rejeu)",
  "▶ Play": "▶ Lecture", "❚❚ Pause": "❚❚ Pause", "Reset": "Réinitialiser", "Theme": "Thème", "Auto": "Auto", "Light": "Clair", "Dark": "Sombre",
  "Loading…": "Chargement…", "Checking…": "Vérification…", "Close": "Fermer", "Cancel": "Annuler", "Change": "Modifier", "Send": "Envoyer",
  "est.": "est.", "(est.)": "(est.)", "required": "obligatoire", "pickup": "ramassage", "delivery": "livraison", "to": "à", "at": "à",
  // dispatcher: KPIs, tabs, lists
  "Waiting for a truck": "En attente d'un camion", "Trucks on the road": "Camions sur la route", "Warnings": "Alertes", "Assigned by you": "Assignés par vous",
  "Positions from Samsara": "Positions de Samsara", "All clear": "Rien à signaler", "None": "Aucun",
  "Orders": "Commandes", "Trucks": "Camions", "Sync log": "Journal de synchro", "New": "Nouvelles", "Alerts": "Alertes", "Sync": "Synchro", "Opened": "Ouverte",
  "New orders received · last hour, no truck yet": "Nouvelles commandes · dernière heure, sans camion",
  "From Elite · waiting for a truck": "D'Elite · en attente d'un camion", "Assigned by phone (Sep 29 history)": "Assignés par téléphone (historique du 29 sept.)",
  "Loading orders…": "Chargement des commandes…", "Loading trucks…": "Chargement des camions…", "Loading truck…": "Chargement du camion…",
  "No pickups waiting.": "Aucun ramassage en attente.", "No warnings right now.": "Aucune alerte pour l'instant.",
  "What we sent to Elite and Samsara": "Ce que nous avons envoyé à Elite et Samsara",
  "Nothing yet. Assign a pickup and every write-back to Elite and Samsara shows here.": "Rien pour l'instant. Assignez un ramassage : chaque mise à jour envoyée à Elite et Samsara s'affiche ici.",
  "Sync": "Synchro", "Decision": "Décision", "Alert": "Alerte", "Driver": "Chauffeur", "New order": "Nouvelle commande", "System": "Système",
  "Search order, address, customer…": "Chercher commande, adresse, client…", "Search truck or driver…": "Chercher camion ou chauffeur…",
  "Search order, address, truck…": "Chercher commande, adresse, camion…",
  "Truck, room on board": "Camion avec de la place", "Truck 70–90% full": "Camion plein à 70–90 %", "Truck full or broken down": "Camion plein ou arrêté",
  "Position from driver's phone": "Position du téléphone du chauffeur", "Pickup waiting for a truck": "Ramassage en attente d'un camion",
  "Driving": "En route", "At a stop": "À un arrêt", "Not started": "Pas parti", "Finished": "Terminé", "Heading to depot": "Retour au dépôt", "Stopped": "Arrêté",
  "Waiting for spare driver": "Attend un remplaçant", "Assigned": "Assigné",
  // dispatcher: order panel
  "Checking every truck…": "Vérification de tous les camions…", "Freight": "Marchandise", "Service": "Service", "Ready": "Prêt", "Status": "Statut", "Deliver to": "Livrer à",
  "Now": "Maintenant", "1. Room?": "1. De la place ?", "2. In time?": "2. À temps ?", "3. Others on time?": "3. Les autres à l'heure ?",
  "weight + floor spots, until the depot": "poids + places au sol, jusqu'au dépôt", "its other stops + 14 h limit": "ses autres arrêts + limite de 14 h",
  "No truck on the road can take it right now.": "Aucun camion sur la route ne peut le prendre maintenant.",
  "It stays in the list; check again as trucks free up, or plan it for a truck leaving the depot.": "Il reste dans la liste ; revérifiez quand des camions se libèrent, ou planifiez-le pour un camion qui part du dépôt.",
  "Assign": "Assigner", "Move to this truck": "Passer à ce camion", "Show top 3": "Voir les 3 meilleurs",
  "What really happened on Sep 29": "Ce qui s'est vraiment passé le 29 sept.", "The dispatcher gave it out by phone at": "Le répartiteur l'a donné par téléphone à",
  "Picked up at": "Ramassé à", "Our first choice now:": "Notre premier choix maintenant :",
  // dispatcher: truck panel
  "On board now": "À bord maintenant", "Weight": "Poids", "Floor spots": "Places au sol", "Driver on duty": "Chauffeur en service",
  "(we plan to 95% of the floor)": "(nous planifions à 95 % du plancher)",
  "Worked out from Elite: deliveries still on board + freight picked up. The driver can confirm with one tap.": "Calculé à partir d'Elite : livraisons encore à bord + marchandise ramassée. Le chauffeur peut confirmer d'un geste.",
  "Stops ahead": "Arrêts à venir", "No stops left.": "Plus aucun arrêt.", "added by you": "ajouté par vous", "Something went wrong?": "Un problème ?",
  "Driver called in sick / can't continue": "Chauffeur malade / ne peut pas continuer", "Truck broke down here": "Le camion est en panne ici",
  "Only for a truck on the road.": "Seulement pour un camion sur la route.", "Prototype tools": "Outils du prototype",
  "Simulate a Samsara gap (20 min)": "Simuler une coupure Samsara (20 min)", "Open this truck's driver screen": "Ouvrir l'écran chauffeur de ce camion",
  "Driver app open": "Appli chauffeur ouverte", "Samsara GPS · live": "GPS Samsara · en direct",
  "1. Rescue truck for the freight on board": "1. Camion de secours pour la marchandise à bord", "2. Its pickups go to other trucks (same 3 checks)": "2. Ses ramassages vont à d'autres camions (mêmes 3 vérifications)",
  "No pickups left on this truck.": "Plus de ramassages sur ce camion.", "No truck on the road has room for the whole load. Send a truck from the depot.": "Aucun camion sur la route n'a de place pour tout le chargement. Envoyez un camion du dépôt.",
  "Apply: mark broken down and move the work": "Appliquer : marquer en panne et déplacer le travail",
  "1. Spare driver takes the same truck": "1. Un chauffeur remplaçant prend le même camion", "2. Share the work with other trucks": "2. Répartir le travail sur d'autres camions",
  "3. Partner carrier for the deliveries": "3. Transporteur partenaire pour les livraisons", "none free": "aucun libre", "cost unknown": "coût inconnu", "all on time": "tous à l'heure",
  "Use spare driver": "Prendre le remplaçant", "Share it out": "Répartir", "Ask a partner": "Demander à un partenaire",
  "No driver with the right licence is free today (on Sep 29 only one spare was on the roster).": "Aucun chauffeur avec le bon permis n'est libre aujourd'hui (le 29 sept., un seul remplaçant était au tableau).",
  "No truck has room for the whole load.": "Aucun camion n'a de place pour tout le chargement.", "Reload its deliveries onto": "Recharger ses livraisons sur",
  ", takes the freight on board.": ", prend la marchandise à bord.", "meets the truck at": "rejoint le camion à", "meets it at": "le rejoint à",
  "no truck can take it now (stays waiting)": "aucun camion ne peut le prendre maintenant (reste en attente)",
  // dispatcher: overview
  "Right now": "En ce moment", "Pick an order on the left or a pin on the map to see the best trucks and why.": "Choisissez une commande à gauche ou une épingle sur la carte pour voir les meilleurs camions et pourquoi.",
  "Every pickup has a truck": "Chaque ramassage a un camion", "Fill the gaps": "Combler les vides", "a truck already passing, ≤ 5 km extra": "un camion qui passe déjà, ≤ 5 km de plus",
  "No easy matches at this moment.": "Aucune correspondance facile pour l'instant.", "Whole day vs what really happened": "Toute la journée vs ce qui s'est passé",
  "Decide when freight is ready": "Décider quand la marchandise est prête", "Same moment as dispatcher": "Au même moment que le répartiteur",
  "Priority: fewer km ↔ earlier pickups": "Priorité : moins de km ↔ ramassages plus tôt", "Picked up earlier": "Ramassés plus tôt", "Typical gain": "Gain typique",
  "Extra km for pickups": "Km en plus pour les ramassages", "Same truck as dispatcher": "Même camion que le répartiteur", "How a truck is chosen": "Comment un camion est choisi",
  "Room": "Place", "In time": "À temps", "Everyone else on time": "Tous les autres à l'heure", "Rank": "Classement",
  // compare
  "Manual dispatch vs our system · Sep 29": "Répartition manuelle vs notre système · 29 sept.", "Placed after 9:00": "Passées après 9 h", "All orders": "Toutes les commandes",
  "Whole day": "Toute la journée", "Same moment": "Même moment", "When freight is ready": "Quand la marchandise est prête", "Orders decided": "Commandes décidées",
  "Customer wait after ready": "Attente du client après prêt", "Extra km for these pickups": "Km en plus pour ces ramassages", "average: ours vs manual": "moyenne : nous vs manuel",
  "ours vs manual, same travel model": "nous vs manuel, même modèle de trajet", "All": "Toutes", "Ours earlier": "Nous plus tôt", "Ours later": "Nous plus tard",
  "Same truck": "Même camion", "No option": "Aucune option", "Placed": "Passée", "Order": "Commande", "Manual (phone)": "Manuel (téléphone)", "Our system": "Notre système",
  "Difference": "Écart", "Replaying the day…": "Rejeu de la journée…", "same truck": "même camion", "about the same": "à peu près pareil",
  "No truck on the road passed the 3 checks; kept the dispatcher's plan": "Aucun camion n'a passé les 3 vérifications ; plan du répartiteur conservé",
  "Manual: real truck and pickup times from Samsara. Ours: our first choice at that moment, taken every time in order (so earlier choices affect later ones). Detours for both use the same travel model. Truck sizes and service cutoffs are Trans Ontario's published values; skid spots are estimated where Elite has none.":
    "Manuel : vrais camions et heures de ramassage de Samsara. Nous : notre premier choix à ce moment, pris chaque fois dans l'ordre (les choix précédents influencent les suivants). Les détours utilisent le même modèle de trajet. Tailles de camions et heures limites : valeurs publiées par Trans Ontario ; places de palettes estimées quand Elite n'en a pas.",
  // customer
  "Book a pickup": "Réserver un ramassage", "Track an order": "Suivre une commande", "Rush": "Urgent", "Same day": "Même jour", "Overnight": "Lendemain", "Out of town": "Hors ville", "LTL": "LTL",
  "Open": "Ouvert", "Closed": "Fermé", "Selected": "Choisi",
  "Pickup before 3:30 pm · delivered today": "Ramassage avant 15 h 30 · livré aujourd'hui", "Order by 12 pm · pickup before 5 pm · delivered by 5 pm": "Commander avant midi · ramassage avant 17 h · livré avant 17 h",
  "Order by 3:30 pm · pickup before 5 pm · delivered next business day": "Commander avant 15 h 30 · ramassage avant 17 h · livré le jour ouvrable suivant", "Pickup before 1:30 pm": "Ramassage avant 13 h 30",
  "Pick up": "Ramassage", "Your company": "Votre entreprise", "Contact": "Personne-ressource", "Phone": "Téléphone", "Pickup address": "Adresse de ramassage",
  "Delivery address": "Adresse de livraison", "Receiver name": "Nom du destinataire", "Pieces": "Pièces", "Skid spots": "Places de palettes", "Weight (lb)": "Poids (lb)",
  "Truck needed": "Camion requis", "Any truck (12 skids / 15,000 lb straight truck is fine)": "N'importe quel camion (porteur 12 palettes / 15 000 lb)", "53' trailer (up to 26 skids / 44,000 lb)": "Remorque 53 pi (jusqu'à 26 palettes / 44 000 lb)",
  "Needs a tailgate (no dock)": "Hayon nécessaire (pas de quai)", "Your reference": "Votre référence",
  "Skid spots tell the dispatcher how much floor your freight takes; they are needed to find a truck with room.": "Les places de palettes indiquent l'espace au sol de votre marchandise ; elles servent à trouver un camion qui a de la place.",
  "Book pickup": "Réserver le ramassage", "Booking…": "Réservation…",
  "Your order goes straight into Trans Ontario's order system (Elite), the same as a phone or email order. A dispatcher confirms the truck; you can track it here.": "Votre commande va directement dans le système de commandes de Trans Ontario (Elite), comme une commande par téléphone ou courriel. Un répartiteur confirme le camion ; vous pouvez la suivre ici.",
  "Type a street or city (Sep 29 addresses)": "Tapez une rue ou une ville (adresses du 29 sept.)", "Loading addresses…": "Chargement des adresses…",
  "No match. The prototype only knows addresses visited on Sep 29.": "Aucun résultat. Le prototype ne connaît que les adresses visitées le 29 sept.",
  "Order number": "Numéro de commande", "Track": "Suivre", "#2988947 · real Sep 29 order": "#2988947 · vraie commande du 29 sept.",
  "Finding the best truck": "Recherche du meilleur camion", "Order received in Elite": "Commande reçue dans Elite", "Truck assigned": "Camion assigné", "Picked up": "Ramassé",
  "At the Trans Ontario depot, Scarborough (overnight)": "Au dépôt Trans Ontario, Scarborough (pour la nuit)", "Delivered next business day": "Livré le jour ouvrable suivant",
  "Your pickup": "Votre ramassage", "Delivery": "Livraison", "Going to the Scarborough depot tonight, delivered next business day.": "Va au dépôt de Scarborough ce soir, livré le jour ouvrable suivant.",
  // driver
  "Which truck are you driving?": "Quel camion conduisez-vous ?", "Driver app · Sep 29 replay": "Appli chauffeur · rejeu du 29 sept.", "Demo truck: the Gibraltar Rd case": "Camion de démo : le cas Gibraltar Rd",
  "Switch truck": "Changer de camion", "New pickup from dispatch": "Nouveau ramassage de la répartition", "Accept": "Accepter", "Can't take it": "Je ne peux pas",
  "No answer is fine: it stays on your route.": "Sans réponse, il reste sur votre route.", "Free floor spots right now?": "Places libres au sol en ce moment ?",
  "Today's stops": "Arrêts d'aujourd'hui", "Arrived and done are marked automatically by the truck's GPS. Nothing to tap.": "Arrivé et terminé sont marqués automatiquement par le GPS du camion. Rien à toucher.",
  "Report a problem": "Signaler un problème", "I'm unwell, can't continue": "Je suis malade, je ne peux pas continuer", "Truck problem, can't drive": "Problème de camion, je ne peux pas rouler",
  "Running late": "En retard", "Truck GPS not updating? Share my phone's location": "Le GPS du camion ne se met pas à jour ? Partager la position de mon téléphone",
  "From dispatch": "De la répartition", "Done": "Fait", "Next": "Prochain", "New": "Nouveau", "Later": "Plus tard", "Handed over": "Transféré", "Pickup": "Ramassage",
  "Loading your route…": "Chargement de votre route…", "Route done": "Route terminée", "A spare driver is coming": "Un remplaçant arrive", "Help is on the way": "De l'aide arrive",
  "Stay with the truck": "Restez avec le camion", "Stay safe; dispatch has a plan": "Restez en sécurité ; la répartition a un plan",
  "Accepted. It's on your route.": "Accepté. C'est sur votre route.", "Dispatch has been told. It goes to another truck.": "La répartition est avisée. Il va à un autre camion.",
  "Dispatch has been alerted. Stay with the truck; you'll get an answer here.": "La répartition est alertée. Restez avec le camion ; vous aurez une réponse ici.",
  "Sharing your phone's location for 20 minutes.": "Partage de la position de votre téléphone pendant 20 minutes.",
  // server labels
  "Not on the road yet": "Pas encore sur la route", "Finished for the day": "Journée terminée", "Broken down": "En panne", "Waiting for a spare driver": "Attend un remplaçant",
  "No room on board": "Pas de place à bord", "No floor space": "Pas d'espace au sol", "Can't get there before closing": "Ne peut pas arriver avant la fermeture",
  "Would make other stops late": "Retarderait d'autres arrêts", "Driver hours limit": "Limite d'heures du chauffeur", "Needs a 53' trailer": "Exige une remorque 53 pi",
  "Too heavy": "Trop lourd", "Can't deliver it the same day": "Ne peut pas livrer le jour même", "Misses the service cutoff": "Dépasse l'heure limite du service",
  "No other stops affected": "Aucun autre arrêt touché", "At the depot, loading": "Au dépôt, chargement", "Back at the depot": "De retour au dépôt",
  "Heading back to the depot": "Retour au dépôt", "Depot": "Dépôt", "Straight truck": "Camion porteur", "53' trailer": "Remorque 53 pi", "Cargo van": "Fourgon",
  "Driver phone": "Téléphone du chauffeur", "Other": "Autre",
  // fragments (text split around numbers and names)
  "Best trucks at": "Meilleurs camions à", "of": "sur", "pass": "passent", "Waiting": "En attente", "Pickup · order": "Ramassage · commande",
  "pick up by": "ramassage avant", "deliver today by": "livrer aujourd'hui avant", "skid spot": "place de palette", "skid spots": "places de palettes", "spot": "place", "spots": "places",
  "skid": "palette", "skids": "palettes", "Score $": "Pointage $", "(lower is better)": "(plus bas = mieux)", "passes by: +": "passe à côté : +", "· by": "· avant",
  "→ delivers today to": "→ livre aujourd'hui à", "by phone so far (Sep 29 history)": "par téléphone jusqu'ici (historique du 29 sept.)",
  "before the": "avant l'heure limite", "cutoff (": "(", "· from Elite": "· d'Elite", "· booked online": "· réservé en ligne", "Pickup planned": "Ramassage prévu",
  "Truck ·": "Camion ·", "Driver": "Chauffeur", "On board after this stop": "À bord après cet arrêt", "lb free · needs": "lb libres · il faut",
  "Room left:": "Place restante :", "lb ·": "lb ·", "Driver reported": "Le chauffeur a signalé", "spots free at": "places libres à", "(we had estimated": "(nous avions estimé",
  "). Their number is used.": "). Son chiffre est utilisé.", "left": "restants", "stops done": "arrêts faits", "Received": "Reçue", "Pick up from": "Ramassage chez",
  "Sync log": "Journal", "pickups need a truck": "ramassages ont besoin d'un camion", "Longest:": "Le plus long :", "broken down": "arrêté(s)",
  "trucks)": "camions)", "Ruled out (": "Écartés (", "pickup": "ramassage", "decided": "décidé", "ready": "prêt", "given": "donné", "picked up": "ramassé",
  "waited": "attente", "detour": "détour", "waits": "attente", "trucks passed": "camions passent", "delivers": "livre", "earlier": "plus tôt", "later": "plus tard",
  "less driving": "de conduite en moins", "more driving": "de conduite en plus", "Open at": "Ouvrir à", "So far (": "Jusqu'ici (",
  "had no truck that could take them (kept as is)": "sans camion possible (gardées telles quelles)", "later:": "plus tard :", "· same truck as dispatcher:": "· même camion que le répartiteur :",
  "vs": "vs", "Each row is a real pickup order. Left: what the dispatcher did by phone that day. Right: what our system suggests": "Chaque ligne est une vraie commande de ramassage. À gauche : ce que le répartiteur a fait par téléphone ce jour-là. À droite : ce que notre système suggère",
  "at the same moment the dispatcher decided": "au moment même où le répartiteur a décidé", "as soon as the freight was ready": "dès que la marchandise était prête", ", using only what was known then.": ", avec seulement ce qu'on savait alors.",
  "truck-hours sooner in total": "heures-camion plus tôt au total", "real dispatch:": "répartition réelle :", "km": "km", "Customer wait counted at $": "Attente client comptée à ", "per minute (illustrative)": "$ par minute (illustratif)",
  "Replays all": "Rejoue les", "pickups given out during Sep 29, taking our first choice each time. Real stop times come from Samsara; our times use the same travel model as App 1. Truck sizes and free wait times are Trans Ontario's published ones (safer single-axle / tandem limits); prices are illustrative.":
    "ramassages donnés le 29 sept., en prenant notre premier choix chaque fois. Heures réelles des arrêts : Samsara ; nos heures : même modèle de trajet que l'App 1. Tailles de camions et temps d'attente gratuits : valeurs publiées par Trans Ontario ; prix illustratifs.",
  "Pick an order": "Choisissez une commande", "can pick up at": "peut ramasser à", "Delivering today": "Livraison aujourd'hui", "You're next ·": "Vous êtes le prochain ·",
  "Truck problem": "Problème de camion", "Driver app ·": "Appli chauffeur ·", "We estimate": "Nous estimons", "from your orders in Elite": "d'après vos commandes dans Elite",
  "Only answer if it looks different.": "Répondez seulement si c'est différent.", "added by dispatch": "ajouté par la répartition", "appt": "rdv",
  "Overnight · pick up by": "Lendemain · ramassage avant", "Next business day": "Jour ouvrable suivant",
  "Jump to time": "Aller à l'heure", "Back to the real Sep 29 day at 11:20: clears bookings, decisions and driver reports": "Retour à la vraie journée du 29 sept. à 11:20 : efface réservations, décisions et rapports des chauffeurs",
  "Connected to the backend": "Connecté au serveur", "Where the position comes from": "D'où vient la position", "Depot: load": "Dépôt : chargement", "Depot: unload": "Dépôt : déchargement",
  "Prototype reset to the real Sep 29 day": "Prototype remis à la vraie journée du 29 sept.", "after it was ready": "après qu'elle était prête", "· pick up by": "· ramassage avant",
  ": extra km + extra driver time + customer wait. You decide; nothing is sent until you click Assign.": " : km en plus + temps chauffeur en plus + attente du client. Vous décidez ; rien n'est envoyé avant que vous cliquiez sur Assigner.",
  ": its other stops keep their appointment (or 17:00), driver under 14 h.": " : ses autres arrêts gardent leur rendez-vous (ou 17:00), chauffeur sous 14 h.",
  ": weight and floor spots on board now (Elite orders) stay under the truck's size until the depot.": " : le poids et les places au sol à bord (commandes Elite) restent sous la capacité du camion jusqu'au dépôt.",
  "had no option (kept as is)": "sans option (gardées telles quelles)", ". Only answer if it looks different.": ". Répondez seulement si c'est différent.",
  "): off today on the roster.": ") : en congé aujourd'hui au tableau.", ". No extra vehicle.": ". Aucun véhicule de plus.", ". Route unchanged, stops about": ". Route inchangée, arrêts environ",
  "min later ·": "min plus tard ·", "30 min to get ready (assumed)": "30 min pour se préparer (hypothèse)", "; takes over at": " ; prend la relève à", "Deliveries done by": "Livraisons faites avant",
  "During the route": "Pendant la route", "Before the truck leaves": "Avant le départ du camion", "Pickups still go to our trucks. Partner rates are not in the data.": "Les ramassages vont quand même à nos camions. Les tarifs des partenaires ne sont pas dans les données.",
  "No far stops; a partner is mostly useful outside the GTA.": "Aucun arrêt éloigné ; un partenaire sert surtout hors de la RGT.", "can't drive": "ne peut pas conduire", "can't continue": "ne peut pas continuer",
  "inferred from vehicles driven": "déduit des véhicules conduits", "spots free": "places libres", "Breakdown at": "Panne à", "Moves the freight over, then does the": "Transfère la marchandise, puis fait les",
  "deliveries and": "livraisons et", "deliveries · done by": "livraisons · fini avant", "lb on board ·": "lb à bord ·", "pickups left.": "ramassages restants.", "(delivered same day)": "(livré le jour même)",
  "Driver called in sick": "Chauffeur malade", "loaded": "chargées",
  ": picked up before the service cutoff (Rush 15:30, Out of town 13:30, Same day / Overnight 17:00). Rush and Same day orders are also delivered by the same truck today.":
    " : ramassé avant l'heure limite du service (Urgent 15:30, Hors ville 13:30, Même jour / Lendemain 17:00). Les commandes Urgent et Même jour sont aussi livrées par le même camion aujourd'hui.",
  "Jump the clock to this moment and open the order": "Avancer l'horloge à ce moment et ouvrir la commande",
  // new: Elite desk, new orders, priority, decline, cost view, AI photo
  "Elite order desk": "Poste de commandes Elite", "simulator": "simulateur", "Elite order desk ↗": "Poste de commandes Elite ↗", "Orders in Elite, as they came in": "Commandes dans Elite, à mesure qu'elles arrivent",
  "Real Sep 29 orders appear at the time they were entered. Each one lands on the dispatcher's screen as a new order.": "Les vraies commandes du 29 sept. apparaissent à l'heure où elles ont été saisies. Chacune arrive à l'écran du répartiteur comme nouvelle commande.",
  "Stand-in for Elite. In production, orders are read from Elite automatically: nobody types anything twice.": "Remplace Elite. En production, les commandes sont lues automatiquement dans Elite : personne ne saisit rien deux fois.",
  "New order from a phone call or email": "Nouvelle commande par téléphone ou courriel", "Came in by": "Reçue par", "Email": "Courriel", "Caller's phone or email": "Téléphone ou courriel de l'appelant",
  "Shipper name": "Nom de l'expéditeur", "Customer reference": "Référence du client", "Save order in Elite": "Enregistrer la commande dans Elite", "Saving…": "Enregistrement…",
  "Regular customer": "Client régulier", "Occasional customer": "Client occasionnel", "New customer": "Nouveau client", "Regular": "Régulier", "Occasional": "Occasionnel",
  "No earlier orders for this phone/email. Remembered after this order.": "Aucune commande antérieure pour ce téléphone/courriel. Mémorisé après cette commande.",
  "After 4 pm, called in": "Après 16 h, par téléphone", "After hours": "Après les heures", "New orders received": "Nouvelles commandes reçues", "Customer": "Client",
  "No earlier orders": "Aucune commande antérieure", "Cost: on": "Coût : oui", "Cost: off": "Coût : non", "Elite desk ↗": "Poste Elite ↗",
  "Driver asks to decline a pickup": "Le chauffeur demande à refuser un ramassage", "Reason:": "Raison :", "Note to the driver (optional)": "Note au chauffeur (facultatif)",
  "Approve decline": "Approuver le refus", "Keep it on this truck": "Le garder sur ce camion",
  "Approve: the pickup goes back to the waiting list with the next best trucks. Keep: it stays on the route and the driver sees your note.": "Approuver : le ramassage retourne dans la liste d'attente avec les meilleurs camions suivants. Garder : il reste sur la route et le chauffeur voit votre note.",
  "New pickup added by dispatch": "Nouveau ramassage ajouté par la répartition", "OK, got it": "OK, compris", "Seen": "Vu", "Ask to decline": "Demander à refuser",
  "It stays on your route. Only dispatch can take it off.": "Il reste sur votre route. Seule la répartition peut l'enlever.", "Why can't you take it?": "Pourquoi ne pouvez-vous pas le prendre ?",
  "No room on the truck": "Pas de place dans le camion", "Can't get there in time": "Je ne peux pas y arriver à temps", "Wrong equipment (e.g. needs a tailgate / dock)": "Mauvais équipement (p. ex. hayon / quai)",
  "Close to my hours limit": "Près de ma limite d'heures", "Add a detail (optional)": "Ajouter un détail (facultatif)", "Send to dispatch": "Envoyer à la répartition",
  "Waiting for dispatch": "En attente de la répartition", "Count free space from a photo": "Compter l'espace libre avec une photo", "In development": "En développement",
  "Take a photo of the open trailer. AI will count the skids and empty floor and suggest the free spots for you to confirm. Not active in this prototype: enter the number above.":
    "Prenez une photo de la remorque ouverte. L'IA comptera les palettes et le plancher libre et proposera les places libres à confirmer. Pas actif dans ce prototype : entrez le chiffre ci-dessus.",
  "Take a photo (preview)": "Prendre une photo (aperçu)", "Photo kept on this phone only. The AI count is coming in a later version.": "Photo gardée sur ce téléphone seulement. Le comptage par IA viendra dans une version ultérieure.",
  "Got it. It's on your route.": "Compris. C'est sur votre route.", "Pick a reason first.": "Choisissez d'abord une raison.",
  "Request sent. Dispatch decides; keep it on your route until they answer.": "Demande envoyée. La répartition décide ; gardez-le sur votre route en attendant la réponse.",
};

// [pattern, replacement] for text with times, numbers and names. Applied in order to whatever FR doesn't match exactly.
const T = "(\\d{1,2}:\\d{2})";
const RULES = [
  [/Rush/g, "Urgent"], [/Same day/g, "Même jour"], [/Overnight/g, "Lendemain"], [/Out of town/g, "Hors ville"],
  [new RegExp(`^Waiting (.+)$`), "En attente $1"],
  [/^Longest: (.+), (.+)$/, "Le plus long : $1, $2"], [/^(\d+) by phone so far \(Sep 29 history\)$/, "$1 par téléphone jusqu'ici (historique du 29 sept.)"],
  [/^(\d+) broken down$/, "$1 arrêté(s)"], [/^(\d+) pickups need a truck$/, "$1 ramassages ont besoin d'un camion"],
  [/No room: ([\d,.]+) lb free, needs ([\d,.]+)/, "Pas de place : $1 lb libres, il en faut $2"],
  [/No floor space: ([\d.]+) spots free, needs ([\d.]+)/, "Pas d'espace au sol : $1 places libres, il en faut $2"],
  [new RegExp(`Can't pick up before ${T} \\((.+) cutoff; earliest ${T}\\)`), "Ramassage impossible avant $1 (limite $2 ; au plus tôt $3)"],
  [new RegExp(`Can't deliver to (.+) by ${T} \\(same-day\\)`), "Livraison impossible à $1 avant $2 (jour même)"],
  [/Would make (\d+) other stops? late \((.+), appt (\d{1,2}:\d{2})\)/, "Retarderait $1 autre(s) arrêt(s) ($2, rdv $3)"],
  [/Would make (\d+) other stops? late \((.+), closes 17:00\)/, "Retarderait $1 autre(s) arrêt(s) ($2, ferme à 17:00)"],
  [/Driver would pass 14 h on duty/, "Le chauffeur dépasserait 14 h de service"], [/Too heavy for a (.+) \(([\d,]+) lb max\)/, "Trop lourd pour : $1 ($2 lb max)"],
  [/^On its way: \+([\d.]+) km$/, "Sur sa route : +$1 km"], [/^Already next door: (\d+) m from its stop$/, "Juste à côté : à $1 m de son arrêt"],
  [/^\+([\d.]+) km extra driving$/, "+$1 km de conduite en plus"],
  [/Room: ([\d,]+) lb · ([\d.]+) spots free/, "Place : $1 lb · $2 places libres"], [/\(estimated\)/g, "(estimé)"],
  [new RegExp(`Picks up at ${T}`), "Ramasse à $1"], [new RegExp(`, freight ready since ${T}`), ", marchandise prête depuis $1"],
  [new RegExp(`\\(before the ${T} (.+) cutoff\\)`), "(avant l'heure limite de $1, $2)"],
  [new RegExp(`^Delivers to (.+) at ${T}, same day$`), "Livre à $1 à $2, le jour même"],
  [/^Its next (\d+) stops? (?:stay|stays) on time(.*)$/, "Ses $1 prochains arrêts restent à l'heure$2"],
  [/^Driving to (.+)$/, "En route vers $1"], [/^Delivering at (.+)$/, "Livraison à $1"], [/^Picking up at (.+)$/, "Ramassage à $1"],
  [new RegExp(`^Not started yet \\(starts ${T}\\)$`), "Pas encore parti (départ $1)"],
  [new RegExp(`^Broken down since ${T}$`), "En panne depuis $1"], [new RegExp(`^Driver off sick since ${T}$`), "Chauffeur malade depuis $1"],
  [new RegExp(`^Waiting for spare driver (.+) \\(takes over ${T}\\)$`), "En attente du remplaçant $1 (relève à $2)"],
  [new RegExp(`^Best trucks at ${T}$`), "Meilleurs camions à $1"], [/^(\d+) of (\d+) pass$/, "$1 sur $2 passent"],
  [/^Assigned by you · (.+) · pickup (.+)$/, "Assigné par vous · $1 · ramassage $2"], [/^Given by phone · (.+)$/, "Donné par téléphone · $1"],
  [/^Pickup · order (\d+)(.*)$/, "Ramassage · commande $1$2"], [/· from Elite/, "· d'Elite"], [/· booked online/, "· réservé en ligne"], [/Web Dispatch portal/, "portail Web Dispatch"],
  [/ · pick up by /, " · ramassage avant "], [/ · deliver today by /, " · livrer aujourd'hui avant "], [/via depot, delivered next business day/, "par le dépôt, livré le jour ouvrable suivant"],
  [/^Score \$(\d+) \(lower is better\)$/, "Pointage $$$1 (plus bas = mieux)"], [/^Show (\d+) more$/, "Voir $1 de plus"], [/^Take it off (.+)$/, "Le retirer de $1"],
  [/^Ruled out \((\d+) trucks\)$/, "Écartés ($1 camions)"],
  [/^(.+) arrives about (\d{1,2}:\d{2})$/, "$1 arrive vers $2"], [/^You're next · /, "Vous êtes le prochain · "], [/^(\d+) stops? before yours · /, "$1 arrêt(s) avant le vôtre · "],
  [/ away · live from the truck's GPS/, " · en direct du GPS du camion"], [new RegExp(`^Received ${T}\\. A dispatcher confirms the truck\\.$`), "Reçue à $1. Un répartiteur confirme le camion."],
  [new RegExp(`^Picked up at ${T}$`), "Ramassé à $1"], [/^Delivering today(.*)$/, "Livraison aujourd'hui$1"], [/^, about /, ", vers "],
  [/^Next: (.+)$/, "Prochain : $1"], [/ · (\d+) skids?/, " · $1 palette(s)"], [/(\d+) skid spots?/, "$1 place(s) de palette"],
  [/already added to your route/, "déjà ajouté à votre route"], [/^We estimate ([\d.]+) from your orders in Elite(.*)\. Only answer if it looks different\.$/, "Nous estimons $1 d'après vos commandes dans Elite$2. Répondez seulement si c'est différent."],
  [/\(some sizes are estimated\)/, "(certaines tailles sont estimées)"], [/^Sent ([\d.]+) free\. Dispatch now uses your number(.*)\.$/, "Envoyé : $1 libres. La répartition utilise maintenant votre chiffre$2."],
  [/ and will check the order sizes/, " et vérifiera les tailles de commandes"],
  [/^Driver app · (.+)$/, "Appli chauffeur · $1"],
  [/^(.+) earlier$/, "$1 plus tôt"], [/^(.+) later$/, "$1 plus tard"], [/^(.+) less driving$/, "$1 de conduite en moins"], [/^(.+) more driving$/, "$1 de conduite en plus"],
  [new RegExp(`given ${T} · picked up `), "donné $1 · ramassé "], [/waited (.+) · detour (.+)/, "attente $1 · détour $2"],
  [/waits (.+) · detour (.+) · (\d+) trucks passed/, "attente $1 · détour $2 · $3 camions passent"], [/^pickup (\d{1,2}:\d{2})/, "ramassage $1"], [/ · delivers /, " · livre "],
  [new RegExp(`^ready ${T}$`), "prêt $1"], [/^ready —$/, "prêt —"], [new RegExp(`^decided ${T}$`), "décidé $1"], [/^before 7:00$/, "avant 7:00"],
  [new RegExp(`^Open at ${T}$`), "Ouvrir à $1"], [/^So far \((.+)\)$/, "Jusqu'ici ($1)"], [/had no truck that could take them \(kept as is\)/, "sans camion possible (gardées telles quelles)"],
  [/^later: (\d+) · same truck as dispatcher: (\d+)$/, "plus tard : $1 · même camion que le répartiteur : $2"],
  [/^(\d+) late$/, "$1 en retard"], [/^(.+) at (\d{1,2}:\d{2})$/, "$1 à $2"],
  [/ running late for (.+) \(appt (.+), ETA (.+)\)/, " en retard pour $1 (rdv $2, arrivée prévue $3)"],
  [/^Pickup (.+) ready for ([\d.]+) h with no truck$/, "Ramassage $1 prêt depuis $2 h sans camion"],
  [/^(.+) pickup (.+) must happen by (\d{1,2}:\d{2}) \((\d+) min left\)$/, "Ramassage $1 $2 à faire avant $3 (reste $4 min)"],
  [/: driver is unwell and can't continue\. Open the truck to act\./, " : le chauffeur est malade et ne peut pas continuer. Ouvrez le camion pour agir."],
  [/: driver has a truck problem\. Open the truck to act\./, " : le chauffeur a un problème de camion. Ouvrez le camion pour agir."],
  [/^Dispatcher assigned (.+) to (.+) \(option (\d+) of (\d+)\), pickup (.+)$/, "Le répartiteur a assigné $1 à $2 (option $3 sur $4), ramassage $5"],
  [/^Elite: order (\d+) P leg → driver (.+), unit (.+)$/, "Elite : commande $1, étape ramassage → chauffeur $2, unité $3"],
  [/^Samsara: route of (.+) updated, new pickup at (.+) \(ETA (.+)\); driver app notified$/, "Samsara : route de $1 mise à jour, nouveau ramassage à $2 (arrivée $3) ; appli chauffeur avisée"],
  [/^Elite: new order (\d+) created from (.+)$/, "Elite : nouvelle commande $1 créée depuis $2"],
  [/ driver accepted pickup at /, " : le chauffeur a accepté le ramassage à "], [/: driver is unwell and can't continue$/, " : le chauffeur est malade et ne peut pas continuer"],
  [/ stopped \(driver off sick\) at (.+); (\d+) pickups moved to other trucks/, " arrêté (chauffeur malade) à $1 ; $2 ramassages déplacés vers d'autres camions"],
  [/^Rescue: (.+) meets it at (.+) for (\d+) deliveries \((\d+) late\)$/, "Secours : $1 le rejoint à $2 pour $3 livraisons ($4 en retard)"],
  [/Driver reported being unwell at (.+)\. Choose what to do below\./, "Le chauffeur a signalé être malade à $1. Choisissez quoi faire ci-dessous."],
  [/^During the route · /, "Pendant la route · "], [/^Before the truck leaves · /, "Avant le départ du camion · "], [/^(.+) can't drive (.+)$/, "$1 ne peut pas conduire $2"],
  [/^Driver (\d+) (.+) \((AZ|DZ), inferred from vehicles driven\): off today on the roster\.$/, "Chauffeur $1 $2 ($3, déduit des véhicules conduits) : en congé aujourd'hui au tableau."],
  [/Order by (\d{1,2}:\d{2}) for (.+)/, "Commander avant $1 pour : $2"], [/Pickup must happen before (\d{1,2}:\d{2})/, "Le ramassage doit avoir lieu avant $1"],
  [/After 4:00 pm orders are called in/, "Après 16 h, les commandes se font par téléphone"],
  [/^Please add (.+)\.$/, "Veuillez ajouter : $1."], [/your company/, "votre entreprise"], [/pickup address/, "adresse de ramassage"], [/delivery address/, "adresse de livraison"],
  [/skid spots/, "places de palettes"], [/an open service/, "un service ouvert"],
  [/^Order (\d+) · (.+)$/, "Commande $1 · $2"], [/^(\d+) \(yours\)$/, "$1 (la vôtre)"], [/^Order (\d+) not found\.$/, "Commande $1 introuvable."],
  [/^Assigned to (.+)\. Elite and the Samsara route are updated\.$/, "Assigné à $1. Elite et la route Samsara sont mis à jour."],
  [/^Reset to the real Sep 29 day at 11:20\.$/, "Retour à la vraie journée du 29 sept. à 11:20."],
  [/ · waiting (.+)$/, " · en attente $1"], [/^NEW · entered (.+) · (.+)$/, "NOUVEAU · saisi $1 · $2"], [/Entered by staff \(phone\/email\)/, "Saisie par le personnel (téléphone/courriel)"],
  [/Phone \(entered in Elite\)/, "Téléphone (saisi dans Elite)"], [/Email \(entered in Elite\)/, "Courriel (saisi dans Elite)"], [/^🔔 (\d+) new$/, "🔔 $1 nouvelles"],
  [/^(\d+) earlier orders · found by (.+)$/, "$1 commandes antérieures · trouvé par $2"], [/phone\/email seen before/, "téléphone/courriel déjà vu"], [/Elite account/, "compte Elite"],
  [/^(\d+) orders on the earlier days · waiting counts 1\.5×$/, "$1 commandes les jours précédents · l'attente compte 1,5×"],
  [/^Regular customer waiting nearby needs this truck's room: (.+)\. Consider assigning that first\.$/, "Un client régulier en attente tout près a besoin de la place de ce camion : $1. Pensez à l'assigner d'abord."],
  [/^\+(\d+) min · \+([\d.]+) km$/, "+$1 min · +$2 km"], [/^New order in Elite: (.+) \((.+)\)$/, "Nouvelle commande dans Elite : $1 ($2)"], [/^(\d+) new orders in Elite$/, "$1 nouvelles commandes dans Elite"],
  [/^Order (\d+) saved in Elite\. It is now on the dispatcher's screen under New orders\.$/, "Commande $1 enregistrée dans Elite. Elle est maintenant à l'écran du répartiteur sous Nouvelles commandes."],
  [/^You asked to decline (.+): (.+)\. Keep it on your route until dispatch answers\.$/, "Vous avez demandé à refuser $1 : $2. Gardez-le sur votre route jusqu'à la réponse."],
  [/^Dispatch kept (.+) on your route$/, "La répartition a gardé $1 sur votre route"], [/^Dispatch approved: (.+) is off your route\.$/, "Approuvé : $1 est retiré de votre route."],
  [/ driver asks to decline (.+): (.+)\. (Approve or keep it on the truck|Open the truck to approve or keep it)\.$/, " : le chauffeur demande à refuser $1 : $2. Approuvez ou gardez-le sur le camion."], [/^En route vers the depot$/, "En route vers le dépôt"], [/^Driving to the depot$/, "En route vers le dépôt"],
  [/^Driven from the depot to the truck \(~(\d+) min\)$/, "Conduit du dépôt jusqu'au camion (~$1 min)"], [/^Far stops \(over 90 km\): (.+)\.$/, "Arrêts éloignés (plus de 90 km) : $1."],
  [/ lb (loaded|on board) · (\d+) deliveries and (\d+) pickups left/, " lb à bord · $2 livraisons et $3 ramassages restants"], [/^Delivers to (.+) at (\d{1,2}:\d{2})$/, "Livre à $1 à $2"], [/ \(added by dispatcher\)$/, " (ajouté par le répartiteur)"], [/^(\d{1,2}:\d{2}) · pickup · /, "$1 · ramassage · "], [/^(\d{1,2}:\d{2}) · delivery · /, "$1 · livraison · "],
  [/^Driver phone \(Samsara silent (\d+) min\)$/, "Téléphone du chauffeur (Samsara muet depuis $1 min)"], [/ · by (\d{1,2}:\d{2})$/, " · avant $1"],
];

const ATTRS = ["placeholder", "title", "aria-label"];
let lang = "en";
const rec = new WeakMap();     // text node -> {en, out}

export function translate(s) {
  if (lang !== "fr" || !s) return s;
  if (s.includes("\n")) return s.split("\n").map(translate).join("\n");
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2];
  if (!core || !/[A-Za-z]/.test(core)) return s;
  let f = FR[core];
  if (f == null) { f = core; for (const [re, rep] of RULES) f = f.replace(re, rep); }
  return m[1] + f + m[3];
}

function skip(el) { return el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el.classList && el.classList.contains("leaflet-tile-pane")); }

function doText(n) {
  const r = rec.get(n), v = n.nodeValue;
  if (r && v === r.out) return;
  const out = translate(v);
  rec.set(n, { en: v, out });
  if (out !== v) n.nodeValue = out;
}
function doAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const v = el.getAttribute(a), key = "data-en-" + a;
    if (el.getAttribute("data-out-" + a) === v) continue;
    el.setAttribute(key, v);
    const out = translate(v);
    el.setAttribute("data-out-" + a, out);
    if (out !== v) el.setAttribute(a, out);
  }
}
function walk(node) {
  if (node.nodeType === 3) return doText(node);
  if (node.nodeType !== 1) return;
  if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") return doAttrs(node);
  if (skip(node)) return;
  doAttrs(node);
  for (const c of node.childNodes) walk(c);
}
function restore(node) {
  if (node.nodeType === 3) { const r = rec.get(node); if (r && node.nodeValue === r.out) { node.nodeValue = r.en; rec.set(node, { en: r.en, out: r.en }); } return; }
  if (node.nodeType !== 1) return;
  for (const a of ATTRS) { const en = node.getAttribute("data-en-" + a); if (en != null && node.getAttribute(a) === node.getAttribute("data-out-" + a)) { node.setAttribute(a, en); node.setAttribute("data-out-" + a, en); } }
  for (const c of node.childNodes) restore(c);
}

let observer = null;
export function setLang(l) {
  lang = l === "fr" ? "fr" : "en";
  document.documentElement.lang = lang === "fr" ? "fr-CA" : "en";
  if (lang === "fr") walk(document.body); else restore(document.body);
  if (!observer) {
    observer = new MutationObserver(ms => {
      if (lang !== "fr") return;
      for (const m of ms) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
}
export const getLang = () => lang;
