// Original 100-question sample for review before expanding the trivia bank.
(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  LD.TriviaBankInfo = {
    "sample": true,
    "version": "review-v1",
    "count": 100,
    "tierCounts": [
      25,
      25,
      25,
      25
    ],
    "answerFormat": "typed",
    "selection": "Individually drafted general trivia; editorial tiers; no automatic rarity ranking.",
    "calibrationReference": "https://opentdb.com/browse.php?page=7",
    "referenceUsage": "Topic and difficulty benchmark only. Questions are original wording, not imported Open Trivia DB records.",
    "reviewStatus": "Individually reviewed for factual wording, aliases, and tier consistency; awaiting player feedback before expansion.",
    "tierCalibration": {
      "1": "Familiar everyday knowledge and widely known popular culture.",
      "2": "Common general knowledge with short, familiar answers.",
      "3": "Approachable pub trivia; recall a familiar name, place, number, or title.",
      "4": "Moderate general trivia; no specialist academic facts or obscure scientific terminology."
    },
    "aliasPolicy": "Exact normalized answers and individually reviewed aliases; surnames allowed when the person is unambiguous; no arbitrary substrings.",
    "scope": "Mixed English-language general knowledge, including some Western popular culture and international geography.",
    "created": "2026-10-05",
    "reviewNotes": [
      "Typed recall has a higher bar than multiple-choice recognition. Tiers are editorial estimates for playtesting, not measured human difficulty.",
      "Surname answers are accepted where prompts ask for a person and the identity is unambiguous. Numeric prompts also accept familiar written-number forms.",
      "The sample includes some Western popular culture and geography. Familiarity will vary by player.",
      "Higher tiers stay within ordinary pub-trivia topics; no specialist academic terminology or long obscure personal names is required."
    ],
    "primaryChecks": [
      {
        "ids": [
          "review-v1-049"
        ],
        "topic": "India's national animal is the tiger.",
        "url": "https://www.mha.gov.in/MHA1/Par2017/pdfs/par2019-pdfs/rs-10072019/1942.pdf"
      },
      {
        "ids": [
          "review-v1-052"
        ],
        "topic": "Linus Torvalds created the Linux kernel.",
        "url": "https://www.kernel.org/linux.html"
      },
      {
        "ids": [
          "review-v1-053"
        ],
        "topic": "William the Conqueror was crowned in 1066.",
        "url": "https://www.royal.uk/william-the-conqueror?page=1"
      },
      {
        "ids": [
          "review-v1-075"
        ],
        "topic": "Tetris originated in 1984 and uses four-square pieces.",
        "url": "https://www.tetris.com/about"
      },
      {
        "ids": [
          "review-v1-030"
        ],
        "topic": "J. K. Rowling's name is Joanne Rowling.",
        "url": "https://www.jkrowling.com/about/"
      },
      {
        "ids": [
          "review-v1-059"
        ],
        "topic": "Curie's Sklodowska family name and first Nobel Prize.",
        "url": "https://www.nobelprize.org/prizes/physics/1903/marie-curie/biographical/"
      },
      {
        "ids": [
          "review-v1-086"
        ],
        "topic": "Ringo Starr replaced Pete Best as the Beatles drummer in 1962.",
        "url": "https://www.thebeatles.com/beatles-anthology-0"
      },
      {
        "ids": [
          "review-v1-091"
        ],
        "topic": "Cusco was the Inca capital.",
        "url": "https://whc.unesco.org/en/list/273/"
      },
      {
        "ids": [
          "review-v1-093"
        ],
        "topic": "Diamond has Mohs hardness10.",
        "url": "https://home.nps.gov/articles/mohs-hardness-scale.htm"
      }
    ]
  };
  LD.TriviaBank = [
    {"id":"review-v1-001","text":"What is the capital city of France?","answer":"Paris","acceptedAnswers":["Paris"],"tier":1,"category":"Geography"},
    {"id":"review-v1-002","text":"Which planet is nicknamed the Red Planet?","answer":"Mars","acceptedAnswers":["Mars"],"tier":1,"category":"Science"},
    {"id":"review-v1-003","text":"How many legs does a spider normally have?","answer":"8","acceptedAnswers":["8","Eight"],"tier":1,"category":"Nature"},
    {"id":"review-v1-004","text":"Which organ pumps blood around the human body?","answer":"Heart","acceptedAnswers":["Heart","The heart"],"tier":1,"category":"Science"},
    {"id":"review-v1-005","text":"In basic paint mixing, what colour do blue and yellow make?","answer":"Green","acceptedAnswers":["Green"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-006","text":"How many days make up one week?","answer":"7","acceptedAnswers":["7","Seven"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-007","text":"Which large land animal has tusks and a long trunk?","answer":"Elephant","acceptedAnswers":["Elephant","An elephant","Elephants"],"tier":1,"category":"Nature"},
    {"id":"review-v1-008","text":"Which ocean borders California's coastline?","answer":"Pacific Ocean","acceptedAnswers":["Pacific Ocean","Pacific","The Pacific"],"tier":1,"category":"Geography"},
    {"id":"review-v1-009","text":"How many months are in a calendar year?","answer":"12","acceptedAnswers":["12","Twelve"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-010","text":"What sweet food do honeybees produce?","answer":"Honey","acceptedAnswers":["Honey"],"tier":1,"category":"Food"},
    {"id":"review-v1-011","text":"What shape has exactly three straight sides?","answer":"Triangle","acceptedAnswers":["Triangle","A triangle"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-012","text":"What do we call water when it freezes solid?","answer":"Ice","acceptedAnswers":["Ice"],"tier":1,"category":"Science"},
    {"id":"review-v1-013","text":"Which storybook puppet's nose grows when he lies?","answer":"Pinocchio","acceptedAnswers":["Pinocchio"],"tier":1,"category":"Arts and books"},
    {"id":"review-v1-014","text":"Winnie-the-Pooh is what kind of animal?","answer":"Bear","acceptedAnswers":["Bear","A bear"],"tier":1,"category":"Arts and books"},
    {"id":"review-v1-015","text":"Which sport does the NBA play?","answer":"Basketball","acceptedAnswers":["Basketball"],"tier":1,"category":"Sports"},
    {"id":"review-v1-016","text":"What is Italy's capital city?","answer":"Rome","acceptedAnswers":["Rome"],"tier":1,"category":"Geography"},
    {"id":"review-v1-017","text":"What do we call a connected row of railway carriages pulled by a locomotive?","answer":"Train","acceptedAnswers":["Train","A train","Trains"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-018","text":"Which compass direction is opposite north?","answer":"South","acceptedAnswers":["South"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-019","text":"What is the name of Earth's natural satellite?","answer":"Moon","acceptedAnswers":["Moon","The Moon"],"tier":1,"category":"Science"},
    {"id":"review-v1-020","text":"What fictional city does Batman usually protect?","answer":"Gotham City","acceptedAnswers":["Gotham City","Gotham"],"tier":1,"category":"Film and TV"},
    {"id":"review-v1-021","text":"Which yellow electric Pokemon is Ash's best-known partner?","answer":"Pikachu","acceptedAnswers":["Pikachu"],"tier":1,"category":"Games"},
    {"id":"review-v1-022","text":"Most common supermarket bananas turn what colour when ripe?","answer":"Yellow","acceptedAnswers":["Yellow"],"tier":1,"category":"Food"},
    {"id":"review-v1-023","text":"Which small blue-and-white Star Wars droid is C-3PO's companion?","answer":"R2-D2","acceptedAnswers":["R2-D2","R2D2"],"tier":1,"category":"Film and TV"},
    {"id":"review-v1-024","text":"How many letters are in the modern English alphabet?","answer":"26","acceptedAnswers":["26","Twenty-six","Twenty six"],"tier":1,"category":"General knowledge"},
    {"id":"review-v1-025","text":"What is water's chemical formula?","answer":"H2O","acceptedAnswers":["H2O"],"tier":1,"category":"Science"},
    {"id":"review-v1-026","text":"What is the capital of Japan?","answer":"Tokyo","acceptedAnswers":["Tokyo"],"tier":2,"category":"Geography"},
    {"id":"review-v1-027","text":"Which musical instrument normally has 88 black-and-white keys?","answer":"Piano","acceptedAnswers":["Piano","A piano"],"tier":2,"category":"Music"},
    {"id":"review-v1-028","text":"At the start of a standard soccer match, how many players are on the field for each team?","answer":"11","acceptedAnswers":["11","Eleven"],"tier":2,"category":"Sports"},
    {"id":"review-v1-029","text":"Who wrote the play Hamlet? A surname is enough.","answer":"William Shakespeare","acceptedAnswers":["William Shakespeare","Shakespeare"],"tier":2,"category":"Arts and books"},
    {"id":"review-v1-030","text":"Who wrote the Harry Potter books? A surname is enough.","answer":"J. K. Rowling","acceptedAnswers":["J. K. Rowling","JK Rowling","Rowling","Joanne Rowling"],"tier":2,"category":"Arts and books"},
    {"id":"review-v1-031","text":"Which chemical element has the symbol Au?","answer":"Gold","acceptedAnswers":["Gold"],"tier":2,"category":"Science"},
    {"id":"review-v1-032","text":"Wimbledon's tennis courts have what playing surface?","answer":"Grass","acceptedAnswers":["Grass","Grass courts"],"tier":2,"category":"Sports"},
    {"id":"review-v1-033","text":"The ruins of Machu Picchu are in which country?","answer":"Peru","acceptedAnswers":["Peru"],"tier":2,"category":"Geography"},
    {"id":"review-v1-034","text":"Which planet is the largest in our solar system?","answer":"Jupiter","acceptedAnswers":["Jupiter"],"tier":2,"category":"Science"},
    {"id":"review-v1-035","text":"What is the name of the young lion who becomes king in Disney's The Lion King?","answer":"Simba","acceptedAnswers":["Simba"],"tier":2,"category":"Film and TV"},
    {"id":"review-v1-036","text":"How many dwarfs live with Snow White in the classic Disney film?","answer":"7","acceptedAnswers":["7","Seven"],"tier":2,"category":"Film and TV"},
    {"id":"review-v1-037","text":"Which country is often nicknamed the Land Down Under?","answer":"Australia","acceptedAnswers":["Australia"],"tier":2,"category":"Geography"},
    {"id":"review-v1-038","text":"Which planet is best known for its large, visible rings?","answer":"Saturn","acceptedAnswers":["Saturn"],"tier":2,"category":"Science"},
    {"id":"review-v1-039","text":"In what year did the United States adopt the Declaration of Independence?","answer":"1776","acceptedAnswers":["1776","Seventeen seventy-six","Seventeen seventy six"],"tier":2,"category":"History"},
    {"id":"review-v1-040","text":"What is the most abundant gas in Earth's atmosphere?","answer":"Nitrogen","acceptedAnswers":["Nitrogen"],"tier":2,"category":"Science"},
    {"id":"review-v1-041","text":"Which continent contains both China and India?","answer":"Asia","acceptedAnswers":["Asia"],"tier":2,"category":"Geography"},
    {"id":"review-v1-042","text":"What is the official language of Brazil?","answer":"Portuguese","acceptedAnswers":["Portuguese"],"tier":2,"category":"Geography"},
    {"id":"review-v1-043","text":"Which European country looks like a boot on many maps?","answer":"Italy","acceptedAnswers":["Italy"],"tier":2,"category":"Geography"},
    {"id":"review-v1-044","text":"Who formulated the three famous laws of motion? A surname is enough.","answer":"Isaac Newton","acceptedAnswers":["Isaac Newton","Newton","Sir Isaac Newton"],"tier":2,"category":"Science"},
    {"id":"review-v1-045","text":"How many strings does a standard classical guitar have?","answer":"6","acceptedAnswers":["6","Six"],"tier":2,"category":"Music"},
    {"id":"review-v1-046","text":"What group of mammals can truly fly, rather than just glide?","answer":"Bats","acceptedAnswers":["Bats","Bat"],"tier":2,"category":"Nature"},
    {"id":"review-v1-047","text":"What is the name of Disney's Little Mermaid?","answer":"Ariel","acceptedAnswers":["Ariel"],"tier":2,"category":"Film and TV"},
    {"id":"review-v1-048","text":"What is the smallest prime number?","answer":"2","acceptedAnswers":["2","Two"],"tier":2,"category":"General knowledge"},
    {"id":"review-v1-049","text":"Which striped big cat is India's national animal?","answer":"Tiger","acceptedAnswers":["Tiger","Bengal tiger","Royal Bengal tiger"],"tier":2,"category":"Nature"},
    {"id":"review-v1-050","text":"What gas do plants absorb from the air during photosynthesis?","answer":"Carbon dioxide","acceptedAnswers":["Carbon dioxide","CO2"],"tier":2,"category":"Science"},
    {"id":"review-v1-051","text":"Who was the first emperor of ancient Rome?","answer":"Augustus","acceptedAnswers":["Augustus","Octavian","Caesar Augustus","Augustus Caesar"],"tier":3,"category":"History"},
    {"id":"review-v1-052","text":"Which operating-system family grew from the kernel created by Linus Torvalds?","answer":"Linux","acceptedAnswers":["Linux","Linux kernel","GNU/Linux","GNU Linux"],"tier":3,"category":"Technology"},
    {"id":"review-v1-053","text":"In what year was William the Conqueror crowned king of England?","answer":"1066","acceptedAnswers":["1066","Ten sixty-six","Ten sixty six","One thousand and sixty-six","One thousand sixty six","1066 AD","AD 1066","1066 CE"],"tier":3,"category":"History"},
    {"id":"review-v1-054","text":"Which river runs through Cairo in Egypt?","answer":"Nile","acceptedAnswers":["Nile","The Nile","Nile River"],"tier":3,"category":"Geography"},
    {"id":"review-v1-055","text":"What is the capital city of Canada?","answer":"Ottawa","acceptedAnswers":["Ottawa"],"tier":3,"category":"Geography"},
    {"id":"review-v1-056","text":"Who was the first person to walk on the Moon? A surname is enough.","answer":"Neil Armstrong","acceptedAnswers":["Neil Armstrong","Armstrong"],"tier":3,"category":"History"},
    {"id":"review-v1-057","text":"Who composed the violin concertos called The Four Seasons? A surname is enough.","answer":"Antonio Vivaldi","acceptedAnswers":["Antonio Vivaldi","Vivaldi"],"tier":3,"category":"Music"},
    {"id":"review-v1-058","text":"At standard sea-level pressure, water boils at what temperature in degrees Celsius?","answer":"100","acceptedAnswers":["100","One hundred","100 C","100 degrees","100 degrees Celsius","100 Celsius","100 degrees centigrade","One hundred degrees Celsius","One hundred degrees centigrade"],"tier":3,"category":"Science"},
    {"id":"review-v1-059","text":"Who was the first woman to win a Nobel Prize? A surname is enough.","answer":"Marie Curie","acceptedAnswers":["Marie Curie","Curie","Marie Sklodowska Curie","Marie Skłodowska Curie","Marie Skłodowska-Curie","Maria Skłodowska-Curie","Maria Sklodowska Curie"],"tier":3,"category":"History"},
    {"id":"review-v1-060","text":"Which chemical element has the symbol Na?","answer":"Sodium","acceptedAnswers":["Sodium"],"tier":3,"category":"Science"},
    {"id":"review-v1-061","text":"Who wrote The Hobbit? A surname is enough.","answer":"J. R. R. Tolkien","acceptedAnswers":["J. R. R. Tolkien","JRR Tolkien","Tolkien"],"tier":3,"category":"Arts and books"},
    {"id":"review-v1-062","text":"Which scientist discovered penicillin in 1928? A surname is enough.","answer":"Alexander Fleming","acceptedAnswers":["Alexander Fleming","Fleming","Sir Alexander Fleming"],"tier":3,"category":"History"},
    {"id":"review-v1-063","text":"Who directed the 1975 film Jaws? A surname is enough.","answer":"Steven Spielberg","acceptedAnswers":["Steven Spielberg","Spielberg"],"tier":3,"category":"Film and TV"},
    {"id":"review-v1-064","text":"In standard Monopoly, how many Monopoly dollars do you collect when you pass GO?","answer":"200","acceptedAnswers":["200","Two hundred","200 dollars","$200"],"tier":3,"category":"Games"},
    {"id":"review-v1-065","text":"What is the name of Japan's famous mountain with a symmetrical volcanic peak?","answer":"Mount Fuji","acceptedAnswers":["Mount Fuji","Fuji","Fujisan","Fuji-san","Mt Fuji","Mt. Fuji"],"tier":3,"category":"Geography"},
    {"id":"review-v1-066","text":"Which Greek god of the sea is usually shown holding a trident?","answer":"Poseidon","acceptedAnswers":["Poseidon"],"tier":3,"category":"Arts and books"},
    {"id":"review-v1-067","text":"Which element comes first in the periodic table?","answer":"Hydrogen","acceptedAnswers":["Hydrogen"],"tier":3,"category":"Science"},
    {"id":"review-v1-068","text":"In what year did the Berlin Wall fall?","answer":"1989","acceptedAnswers":["1989","Nineteen eighty-nine","Nineteen eighty nine"],"tier":3,"category":"History"},
    {"id":"review-v1-069","text":"The Highland bagpipe is especially associated with which country?","answer":"Scotland","acceptedAnswers":["Scotland"],"tier":3,"category":"Geography"},
    {"id":"review-v1-070","text":"Who wrote Animal Farm? A surname is enough.","answer":"George Orwell","acceptedAnswers":["George Orwell","Orwell"],"tier":3,"category":"Arts and books"},
    {"id":"review-v1-071","text":"Which city hosted the first modern Olympic Games in 1896?","answer":"Athens","acceptedAnswers":["Athens"],"tier":3,"category":"Sports"},
    {"id":"review-v1-072","text":"Which film series features Doc Brown's time-travelling DeLorean?","answer":"Back to the Future","acceptedAnswers":["Back to the Future","Back To The Future trilogy","BTTF"],"tier":3,"category":"Film and TV"},
    {"id":"review-v1-073","text":"What soft white cheese is traditionally used with tomato and basil in a Caprese salad?","answer":"Mozzarella","acceptedAnswers":["Mozzarella","Mozzarella cheese","Fresh mozzarella","Buffalo mozzarella"],"tier":3,"category":"Food"},
    {"id":"review-v1-074","text":"Which chess piece moves diagonally and never moves in a straight row or column?","answer":"Bishop","acceptedAnswers":["Bishop","A bishop","Bishops"],"tier":3,"category":"Games"},
    {"id":"review-v1-075","text":"Which 1984 falling-block puzzle game popularized pieces made from four squares?","answer":"Tetris","acceptedAnswers":["Tetris"],"tier":3,"category":"Games"},
    {"id":"review-v1-076","text":"What is the national capital city of Brazil?","answer":"Brasilia","acceptedAnswers":["Brasilia"],"tier":4,"category":"Geography"},
    {"id":"review-v1-077","text":"The historic city of Timbuktu is in which African country?","answer":"Mali","acceptedAnswers":["Mali"],"tier":4,"category":"Geography"},
    {"id":"review-v1-078","text":"What is a ring of coral islands surrounding an ocean lagoon called?","answer":"Atoll","acceptedAnswers":["Atoll","An atoll"],"tier":4,"category":"Geography"},
    {"id":"review-v1-079","text":"In Roman mythology, who is the messenger of the gods?","answer":"Mercury","acceptedAnswers":["Mercury"],"tier":4,"category":"Arts and books"},
    {"id":"review-v1-080","text":"What is South Korea's currency called?","answer":"Won","acceptedAnswers":["Won","Korean won","South Korean won","KRW"],"tier":4,"category":"Geography"},
    {"id":"review-v1-081","text":"Which canal connects the Mediterranean Sea to the Red Sea?","answer":"Suez Canal","acceptedAnswers":["Suez Canal","Suez"],"tier":4,"category":"Geography"},
    {"id":"review-v1-082","text":"Who invented the World Wide Web? A surname is enough.","answer":"Tim Berners-Lee","acceptedAnswers":["Tim Berners-Lee","Berners-Lee","Tim Berners Lee","Berners Lee"],"tier":4,"category":"Technology"},
    {"id":"review-v1-083","text":"Which sport has positions called prop, hooker, and scrum-half?","answer":"Rugby","acceptedAnswers":["Rugby","Rugby union","Rugby football","Rugby league"],"tier":4,"category":"Sports"},
    {"id":"review-v1-084","text":"Who painted Girl with a Pearl Earring? A surname is enough.","answer":"Johannes Vermeer","acceptedAnswers":["Johannes Vermeer","Vermeer","Jan Vermeer"],"tier":4,"category":"Arts and books"},
    {"id":"review-v1-085","text":"Which novel opens with the words \"Call me Ishmael\"?","answer":"Moby-Dick","acceptedAnswers":["Moby-Dick","Moby Dick","Moby Dick or the Whale"],"tier":4,"category":"Arts and books"},
    {"id":"review-v1-086","text":"Who was the Beatles' regular drummer from 1962 to 1970? A first name or surname is enough.","answer":"Ringo Starr","acceptedAnswers":["Ringo Starr","Ringo","Starr","Richard Starkey","Starkey"],"tier":4,"category":"Music"},
    {"id":"review-v1-087","text":"Who wrote The Picture of Dorian Gray? A surname is enough.","answer":"Oscar Wilde","acceptedAnswers":["Oscar Wilde","Wilde"],"tier":4,"category":"Arts and books"},
    {"id":"review-v1-088","text":"In computing, what do the letters CPU stand for?","answer":"Central processing unit","acceptedAnswers":["Central processing unit"],"tier":4,"category":"Technology"},
    {"id":"review-v1-089","text":"On which continent is the Atacama Desert?","answer":"South America","acceptedAnswers":["South America"],"tier":4,"category":"Geography"},
    {"id":"review-v1-090","text":"What kind of amphibian is an axolotl?","answer":"Salamander","acceptedAnswers":["Salamander","Salamanders"],"tier":4,"category":"Nature"},
    {"id":"review-v1-091","text":"Which city in Peru was the historic capital of the Inca Empire?","answer":"Cusco","acceptedAnswers":["Cusco","Cuzco"],"tier":4,"category":"History"},
    {"id":"review-v1-092","text":"The Rubik's Cube was invented in which European country?","answer":"Hungary","acceptedAnswers":["Hungary"],"tier":4,"category":"Games"},
    {"id":"review-v1-093","text":"A diamond is rated 10 on which mineral-hardness scale?","answer":"Mohs scale","acceptedAnswers":["Mohs scale","Mohs","Mohs hardness scale"],"tier":4,"category":"Science"},
    {"id":"review-v1-094","text":"Which Italian volcano buried Pompeii in AD 79?","answer":"Mount Vesuvius","acceptedAnswers":["Mount Vesuvius","Vesuvius"],"tier":4,"category":"History"},
    {"id":"review-v1-095","text":"What is the capital of Finland?","answer":"Helsinki","acceptedAnswers":["Helsinki"],"tier":4,"category":"Geography"},
    {"id":"review-v1-096","text":"Who led the first expedition to reach the South Pole in 1911? A surname is enough.","answer":"Roald Amundsen","acceptedAnswers":["Roald Amundsen","Amundsen"],"tier":4,"category":"History"},
    {"id":"review-v1-097","text":"Which chemical element has the symbol Hg?","answer":"Mercury","acceptedAnswers":["Mercury"],"tier":4,"category":"Science"},
    {"id":"review-v1-098","text":"Who created the detective Sherlock Holmes? A surname is enough.","answer":"Arthur Conan Doyle","acceptedAnswers":["Arthur Conan Doyle","Conan Doyle","Doyle","Sir Arthur Conan Doyle"],"tier":4,"category":"Arts and books"},
    {"id":"review-v1-099","text":"In sheet music, the instruction forte asks a musician to play at what volume?","answer":"Loud","acceptedAnswers":["Loud","Loudly","Loud volume"],"tier":4,"category":"Music"},
    {"id":"review-v1-100","text":"Which Mediterranean island was Napoleon first exiled to in 1814?","answer":"Elba","acceptedAnswers":["Elba"],"tier":4,"category":"History"}
  ];
})(typeof globalThis !== 'undefined' ? globalThis : window);
