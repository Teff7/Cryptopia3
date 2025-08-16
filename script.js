// Adapted game logic for the custom JSON schema

/*
 * This script powers a simple cryptic crossword clue game. It loads clues
 * from a JSON file, transforms them into a unified format, and provides
 * interactive features such as hints, letter reveals, and the ability to
 * give up on a clue. When a clue is answered correctly (or the user gives
 * up), the Submit button becomes a Next button, allowing the player to
 * control when to advance. This implementation supports the new JSON
 * schema provided by the user, which includes nested definition and parse
 * objects along with detailed tooltip hints for each clue component.
 */

// List of all loaded clues after transformation
let allClues = [];
// The clue currently being played
let currentEntry;
// Index of the current clue within allClues
let currentIndex = 0;
// The answer string for the current clue (upper-case, includes spaces)
let answer = '';
// The answer with all spaces removed; used for letter indexing
let answerStripped = '';
// Array of user-entered letters for each position in answerStripped
let letters = [];
// Index of the currently active letter box
let activeIndex = 0;
// Whether the current clue has been solved or revealed
let solved = false;

// Grab key DOM elements up front
const clueDiv    = document.getElementById('clue');
const squaresDiv = document.getElementById('squares');
const gameScreen = document.getElementById('game');
const dd         = document.getElementById('hintsDropdown');
const btnHints   = document.getElementById('btnHints');
const btnGiveUp  = document.getElementById('btnGiveUp');
const miDef      = document.getElementById('miDef');
const miLetter   = document.getElementById('miLetter');
const miAnalyse  = document.getElementById('miAnalyse');
const miPlain    = document.getElementById('miPlain');

// Tooltip text by clue type (matches the parse.type or clueType)
const tooltips = {
  anagram:    'Anagram — shuffle the letters in the fodder.',
  hidden:     'Hidden — look inside the fodder.',
  container:  'Container — insert one part into another.',
  reversal:   'Reversal — read backwards.',
  deletion:   'Deletion — remove letters.',
  homophone:  'Homophone — sounds like.',
  acrostic:   'Acrostic — take first letters.',
  spoonerism: 'Spoonerism — swap starting sounds.',
  charade:    'Charade — build the answer in parts.',
  double:     'Double definition — two meanings, one word.',
  lit:        '&lit — whole clue is definition and wordplay.'
};

// Escape a string for use in a regular expression
function escapeRegex(s){
  return s.replace(/[.*+?^${}()|[\\]\]/g,'\\$&');
}

/**
 * Transform the custom JSON schema into the simplified structure used by
 * the game engine. Each clue object in the input is converted into an
 * object with the following properties:
 *   - answer (string)
 *   - clue (string)
 *   - type (defaults to 'cryptic')
 *   - clueType (parse.type or derived from tooltips.clueType)
 *   - definitionWords or definitions (array of strings)
 *   - indicatorWords (array of indicator phrases)
 *   - fodderWords (array of fodder words)
 *   - parts (array of { text, hint })
 */
function transformJSON(clues){
  const result = [];
  clues.forEach(clue => {
    const entry = {};
    entry.answer = clue.answer || '';
    entry.clue   = clue.clue   || '';
    entry.type   = clue.type   || 'cryptic';
    // Determine the primary clue type
    if (clue.parse && clue.parse.type) {
      entry.clueType = clue.parse.type.toLowerCase();
    } else if (clue.tooltips && clue.tooltips.clueType) {
      // Fall back to parsing the tooltip title (e.g. "This is a CHARADES clue: ...")
      const words = clue.tooltips.clueType.split(' ');
      // Assume the 3rd word is the type, e.g. "CHARADES" from "This is a CHARADES clue"
      entry.clueType = words[2] ? words[2].toLowerCase().replace(/s$/,'') : 'unknown';
    } else {
      entry.clueType = 'unknown';
    }
    // Definition(s)
    if (entry.clueType.startsWith('double') && clue.definition && clue.definition.text) {
      // Attempt to split double definitions by semicolon, comma, or " and "
      entry.definitions = clue.definition.text.split(/;|,| and /i).map(s => s.trim()).filter(Boolean);
    } else if (clue.definition && clue.definition.text) {
      entry.definitionWords = [clue.definition.text];
    } else {
      entry.definitionWords = [];
    }
    // Collect indicator phrases from parse.parts and indicatorsUsed
    const indicators = [];
    if (clue.parse && Array.isArray(clue.parse.parts)) {
      clue.parse.parts.forEach(p => {
        if (p.indicator && p.indicator.text) indicators.push(p.indicator.text);
      });
    }
    if (Array.isArray(clue.indicatorsUsed)) {
      clue.indicatorsUsed.forEach(obj => {
        if (obj.text) indicators.push(obj.text);
      });
    }
    entry.indicatorWords = Array.from(new Set(indicators));
    // Build the list of fodder words
    const fodder = [];
    if (clue.parse && Array.isArray(clue.parse.parts)) {
      clue.parse.parts.forEach(p => {
        if (p.type === 'literal' && p.source && p.source.text) {
          fodder.push(p.source.text);
        } else if (p.type === 'letter-selection' && p.base) {
          fodder.push(p.base);
        } else if (p.source && p.source.text) {
          fodder.push(p.source.text);
        }
      });
    }
    entry.fodderWords = fodder;
    // Build the parts array with hints
    const partsArr = [];
    if (clue.parse && Array.isArray(clue.parse.parts)) {
      clue.parse.parts.forEach(p => {
        let text = '';
        if (p.type === 'literal' && p.source && p.source.text) {
          text = p.source.text;
        } else if (p.type === 'letter-selection' && p.base) {
          text = p.base;
        } else if (p.source && p.source.text) {
          text = p.source.text;
        }
        let hint = '';
        if (clue.tooltips && Array.isArray(clue.tooltips.components)) {
          const comp = clue.tooltips.components.find(c => c.for === p.id);
          if (comp && comp.text) hint = comp.text;
        }
        partsArr.push({ text, hint });
      });
    }
    entry.parts = partsArr;
    result.push(entry);
  });
  return result;
}

// Show the game screen and hide the welcome screen
function startGame(){
  const welcome = document.getElementById('welcome');
  const game    = document.getElementById('game');
  if (welcome) welcome.style.display = 'none';
  if (game)    game.style.display    = 'flex';
  const mi = document.getElementById('mobileInput');
  if (mi && mi.focus) mi.focus();
}

// Load a specific clue by index
function fetchClue(i){
  currentIndex = i;
  currentEntry = allClues[i] || allClues[0];
  setupGame(currentEntry);
}

// Prepare the game state for a new clue
function setupGame(entry){
  // Reset hint states and enable menu items
  clueDiv.classList.remove('help-on','annot-on');
  miDef.disabled    = false;
  miLetter.disabled = false;
  miAnalyse.disabled= false;
  // Reset solved flag and answer buffers
  solved = false;
  answer = (entry.answer || '').toUpperCase();
  answerStripped = answer.replace(/ /g,'');
  letters = Array(answerStripped.length).fill('');
  activeIndex = 0;
  // Reset submit button
  const btn = document.getElementById('submitBtn');
  if (btn) {
    btn.textContent = 'Submit';
    btn.disabled = false;
  }
  // Build the clue HTML with highlighted segments
  let html = entry.clue || '';
  const typeKey = (entry.clueType || '').toLowerCase().split(' ')[0];
  // Highlight definitions or definitions array
  if (entry.definitions && entry.definitions.length >= 2) {
    entry.definitions.forEach((phrase,i) => {
      const re = new RegExp(escapeRegex(phrase),'i');
      html = html.replace(re, `<span class="def" data-tooltip="Double definition — meaning ${i+1}">${phrase}</span>`);
    });
  } else if (entry.definitionWords && entry.definitionWords.length) {
    entry.definitionWords.forEach(word => {
      const re = new RegExp('\\b'+escapeRegex(word)+'\\b','i');
      html = html.replace(re, `<span class="def" data-tooltip="Definition">${word}</span>`);
    });
  }
  // Highlight indicator words
  if (entry.indicatorWords && entry.indicatorWords.length) {
    entry.indicatorWords.forEach(word => {
      const re = new RegExp('\\b'+escapeRegex(word)+'\\b','i');
      const hint = tooltips[typeKey] || 'Indicator';
      html = html.replace(re, `<span class="indicator" data-tooltip="${hint}">${word}</span>`);
    });
  }
  // Highlight fodder words with their hints
  const parts = entry.parts || [];
  if (entry.fodderWords && entry.fodderWords.length) {
    entry.fodderWords.forEach((word,i) => {
      const re = new RegExp('\\b'+escapeRegex(word)+'\\b','i');
      const hint = (parts[i] && parts[i].hint) ? parts[i].hint : 'Fodder — used to build the answer.';
      html = html.replace(re, `<span class="fodder" data-tooltip="${hint}">${word}</span>`);
    });
  }
  clueDiv.className = `clue ${typeKey}`;
  clueDiv.innerHTML = html;
  // Render blank squares for the new clue
  renderSquares();
}

// Render the letter squares for the current answer
function renderSquares(){
  squaresDiv.innerHTML = '';
  const words = answer.split(' ');
  let idx = 0;
  words.forEach(word => {
    const group = document.createElement('div');
    group.className = 'word-group';
    squaresDiv.appendChild(group);
    for (let i = 0; i < word.length; i++) {
      const box = document.createElement('div');
      box.className = 'square';
      box.textContent = letters[idx] || '';
      // Capture the current index in a separate variable to avoid closure issues
      const thisIndex = idx;
      box.onclick = () => {
        activeIndex = thisIndex;
        highlightActive();
        // Refocus the hidden input so typing immediately works after clicking
        const mi = document.getElementById('mobileInput');
        if (mi && mi.focus) mi.focus();
      };
      group.appendChild(box);
      idx++;
    }
  });
  highlightActive();
}

// Highlight the currently active square
function highlightActive(){
  const boxes = document.querySelectorAll('.square');
  boxes.forEach((b,i) => b.classList.toggle('active', i === activeIndex));
}

// Handle clicking the Submit/Next button
function submitAnswer(){
  if (!solved) {
    // Check the user's answer
    if (letters.join('') === answerStripped) {
      solved = true;
      // Trigger green flash to indicate success
      gameScreen.classList.add('flash-green');
      setTimeout(() => gameScreen.classList.remove('flash-green'), 2000);
      // Change button text to "Next"
      const btn = document.getElementById('submitBtn');
      if (btn) btn.textContent = 'Next';
    } else {
      // Wrong answer: flash red
      gameScreen.classList.add('flash-red');
      setTimeout(() => gameScreen.classList.remove('flash-red'), 600);
    }
  } else {
    // Move to the next clue if there is one, otherwise finish the game
    if (currentIndex < allClues.length - 1) {
      fetchClue(currentIndex + 1);
    } else {
      finishGame();
    }
  }
}

// Hide core UI elements and launch fireworks when the game is finished
function finishGame(){
  ['clue','squares','submitBtn','btnHints','btnGiveUp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  showFireworks();
}

// Generate a simple fireworks effect by placing random white pixels on the screen
function showFireworks(){
  const fw = document.getElementById('fireworks');
  fw.innerHTML = '';
  for (let i = 0; i < 100; i++) {
    const p = document.createElement('div');
    p.className = 'pixel';
    p.style.top  = Math.random()*100 + 'vh';
    p.style.left = Math.random()*100 + 'vw';
    fw.appendChild(p);
  }
}

// Wire up all button and input handlers
function setupHandlers(){
  // Play button toggles the welcome/game screens
  const playBtn = document.getElementById('playButton');
  if (playBtn) playBtn.addEventListener('click', () => startGame());

  // Hints dropdown toggle
  // Cache the dropdown container so we toggle the correct element.
  const dropdownContainer = btnHints ? btnHints.parentElement : null;
  btnHints.addEventListener('click', e => {
    e.stopPropagation();
    if (dropdownContainer) {
      dropdownContainer.classList.toggle('open');
      btnHints.setAttribute('aria-expanded', dropdownContainer.classList.contains('open') ? 'true' : 'false');
    }
  });
  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!dropdownContainer) return;
    if (!dropdownContainer.contains(e.target) && e.target !== btnHints) {
      dropdownContainer.classList.remove('open');
      btnHints.setAttribute('aria-expanded','false');
    }
  });
  // Reveal definition: highlight the definition text
  miDef.addEventListener('click', () => {
    clueDiv.classList.add('help-on');
    miDef.disabled = true;
    dd.classList.remove('open');
    btnHints.setAttribute('aria-expanded','false');
  });
  // Reveal one letter at a time
  miLetter.addEventListener('click', () => {
    for (let i = 0; i < letters.length; i++) {
      if (!letters[i]) {
        letters[i] = answerStripped[i];
        renderSquares();
        break;
      }
    }
    // If revealing a letter solves the clue, treat as solved
    if (letters.join('') === answerStripped) {
      solved = true;
      const btn = document.getElementById('submitBtn');
      if (btn) btn.textContent = 'Next';
    }
    dd.classList.remove('open');
    btnHints.setAttribute('aria-expanded','false');
  });
  // Reveal clue structure: show indicator/fodder tooltips and highlight colours
  miAnalyse.addEventListener('click', () => {
    clueDiv.classList.add('annot-on');
    miAnalyse.disabled = true;
    dd.classList.remove('open');
    btnHints.setAttribute('aria-expanded','false');
  });
  // Change clue: skip to the next clue
  miPlain.addEventListener('click', () => {
    dd.classList.remove('open');
    btnHints.setAttribute('aria-expanded','false');
    if (currentIndex < allClues.length - 1) {
      fetchClue(currentIndex + 1);
    }
  });
  // Give up button: fill in the rest of the answer and switch to Next mode
  btnGiveUp.addEventListener('click', () => {
    if (!solved) {
      letters = answerStripped.split('');
      renderSquares();
      solved = true;
      const btn = document.getElementById('submitBtn');
      if (btn) btn.textContent = 'Next';
    } else {
      // Already solved: advance to next clue
      if (currentIndex < allClues.length - 1) {
        fetchClue(currentIndex + 1);
      } else {
        finishGame();
      }
    }
  });
  // Submit button: either check the answer or move on to the next clue
  document.getElementById('submitBtn').addEventListener('click', submitAnswer);
  // Handle input from the hidden text box (mobile support)
  document.getElementById('mobileInput').addEventListener('input', e => {
    const ch = e.data || e.target.value;
    if (/^[a-zA-Z]$/.test(ch)) {
      letters[activeIndex] = ch.toUpperCase();
      if (activeIndex < letters.length - 1) activeIndex++;
      renderSquares();
    }
    e.target.value = '';
  });
  // Global keyboard events for desktop users
  document.addEventListener('keydown', e => {
    if (/^[a-zA-Z]$/.test(e.key)) {
      letters[activeIndex] = e.key.toUpperCase();
      if (activeIndex < letters.length - 1) activeIndex++;
      renderSquares();
    } else if (e.key === 'Backspace') {
      letters[activeIndex] = '';
      if (activeIndex > 0) activeIndex--;
      renderSquares();
    } else if (e.key === 'Enter') {
      submitAnswer();
    }
  });
}

// On page load: fetch clues, transform them, and initialise the game
window.addEventListener('load', () => {
  fetch('clues.json')
    .then(res => res.json())
    .then(json => {
      allClues = transformJSON(json);
      setupHandlers();
      fetchClue(0);
    })
    .catch(err => console.error(err));
});