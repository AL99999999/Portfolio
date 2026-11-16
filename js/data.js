/* ============================================================
   ATS — CONTENU DU SITE
   Tout ce qui est modifiable sans toucher au reste du code.
   ============================================================ */
window.ATS = {

  /* ---------- CONTACT ----------
     Laisse une valeur vide ('') pour masquer un lien. */
  contact: {
    email: 'ats.wav999@gmail.com',
    instagram: 'https://www.instagram.com/ats.wav999/',
    youtube: '',
    soundcloud: '',
    spotify: '',
    linkedin: '',
    cv: ''                              // ex : 'assets/cv-ats.pdf' (affiche un bouton « Télécharger le CV »)
  },

  /* ---------- PRODS ----------
     Chaque titre est lu de la façon suivante, dans cet ordre :

     1. « src » : le fichier complet déposé dans  site/audio/  (mp3, m4a, wav).

     2. « deezer » : si aucun fichier local n'existe, le site lit l'extrait officiel
        de 30 secondes fourni par Deezer et propose un lien vers le titre complet.

     « liens » (optionnel) : les adresses exactes du titre sur chaque plateforme.
          liens: { spotify: 'https://open.spotify.com/track/…', apple: '…', youtube: '…' }
        Sans adresse exacte, le lien ouvre la recherche du titre sur la plateforme.
        Le lien Deezer est toujours exact (il vient de l'identifiant « deezer »).

     Pour ajouter une prod : copie un bloc { ... } et change les valeurs.
     L'identifiant Deezer est le nombre à la fin du lien deezer.com/track/XXXX. */
  tracks: [
    {
      titre: 'Méritant',
      artistes: 'OMAAI & Leeyn',
      projet: 'Single — 2025',
      role: 'Prod.',
      cover: 'assets/covers/meritant.jpg',
      src: 'audio/meritant.mp3',
      deezer: 3424283761
    },
    {
      titre: 'Pleur Su Moin',
      artistes: 'Leeyn & Kento7',
      projet: 'Single — 2025',
      role: 'Prod.',
      cover: 'assets/covers/pleur-su-moin.jpg',
      src: 'audio/pleur-su-moin.mp3',
      deezer: 3659596772
    },
    {
      titre: 'Clair de lune',
      artistes: 'Leeyn & ATS',
      projet: 'Single — 2023',
      role: 'Prod.',
      cover: 'assets/covers/clair-de-lune.jpg',
      src: 'audio/clair-de-lune.mp3',
      deezer: 2516613721
    },
    {
      titre: 'Crash Down',
      artistes: 'Ivy St4r',
      projet: 'Single — 2025',
      role: 'Prod.',
      cover: 'assets/covers/crash-down.jpg',
      src: 'audio/crash-down.mp3',
      deezer: 3568053401,
      liens: { apple: 'https://music.apple.com/fr/album/crash-down/1841801964?i=1841801967' }
    },
    {
      titre: 'Exo',
      artistes: 'Nairod',
      projet: 'Album « Universale »',
      role: 'Prod.',
      cover: 'assets/covers/exo.jpg',
      src: 'audio/exo.mp3',
      deezer: 2038008507
    },
    {
      titre: 'Sick',
      artistes: 'Smith',
      projet: 'Album « Relique S » — 2023',
      role: 'Prod.',
      cover: 'assets/covers/sick.jpg',
      src: 'audio/sick.mp3',
      deezer: 2376306715
    },
    {
      titre: '4x Filtré',
      artistes: 'Smith, R2bz, Sko2t',
      projet: 'Single — 2024',
      role: 'Prod.',
      cover: 'assets/covers/4x-filtre.jpg',
      src: 'audio/4x-filtre.mp3',
      deezer: 2696331572
    },
    {
      titre: 'Ziss 3 Rounds',
      artistes: 'Smith',
      projet: 'Single — 2024',
      role: 'Prod.',
      cover: 'assets/covers/3-rounds.jpg',
      src: 'audio/3-rounds.mp3',
      deezer: 3011299531
    }
  ],

  /* ---------- VIDÉO / MOTION ---------- */
  videos: [
    {
      titre: 'National Geographic',
      type: 'Bande-annonce fictive',
      detail: 'Montage et musique originale par ATS',
      annee: '',
      src: 'assets/video/national-geographic.mp4',
      poster: 'assets/posters/national-geographic.jpg'
    },
    {
      titre: 'Luminaissance',
      type: 'Court-métrage',
      detail: 'Festival Hello Planet — musique originale, participation au montage',
      annee: '2023',
      src: 'assets/video/luminaissance.mp4',
      poster: 'assets/posters/luminaissance.jpg'
    },
    {
      titre: 'Terminator',
      type: 'Trailer',
      detail: 'Montage bande-annonce',
      annee: '',
      src: 'assets/video/terminator-trailer.mp4',
      poster: 'assets/posters/terminator-trailer.jpg'
    },
    {
      titre: 'Creative Makers Campus',
      type: 'Motion design',
      detail: 'Animation de logo',
      annee: '2024',
      src: 'assets/video/logo-animation.mp4',
      poster: 'assets/posters/logo-animation.jpg'
    }
  ]
};
