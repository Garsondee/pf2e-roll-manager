const multiStatisticActions = {
	'arrest-a-fall': ['acrobatics', 'reflex'],
	'decipher-writing': ['arcana', 'occultism', 'society', 'religion'],
	'escape': ['athletics', 'acrobatics', 'thievery'],
	'grab-an-edge': ['acrobatics', 'reflex'],
	'identify-magic': ['occult', 'arcana', 'religion', 'nature'],
	'learn-a-spell': ['occult', 'arcana', 'religion', 'nature'],
	'recall-knowledge': [
		'arcana', 'occultism', 'society', 'religion', 'acrobatics', 'athletics', 'crafting',
		'deception', 'diplomacy', 'intimidation', 'medicine', 'nature', 'performance',
		'stealth', 'survival', 'thievery'
	],
	'subsist': ['survival', 'society']
};

function formatSkillName(skillName) {
	// Assuming skillName is in the format "skill:variant" or just "skill"
	const parts = skillName.split(':');
	const baseSkill = parts[0];
	const variant = parts[1] ? ` (${parts[1]})` : '';

	// Convert the base skill to title case
	const formattedBaseSkill = baseSkill.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

	return formattedBaseSkill + variant;
}

function createSkillSelect(actor, skillsToRoll, skills, saves, otherAttributes) {
	console.log(`Creating skill select for actor: ${actor.name}, skillsToRoll: ${skillsToRoll}`);
	const skillSelect = document.createElement('select');
	const actionToStatisticMap = {
		'avoid-notice': ['stealth'],
		'conceal-an-object': ['stealth'],
		'hide': ['stealth'],
		'sneak': ['stealth'],
		'balance': ['acrobatics'],
		'maneuver-in-flight': ['acrobatics'],
		'squeeze': ['acrobatics'],
		'tumble-through': ['acrobatics'],
		'identify-alchemy': ['crafting'],
		'craft': ['crafting'],
		'create-forgery': ['deception'],
		'feint': ['deception'],
		'impersonate': ['deception'],
		'lie': ['deception'],
		'gather-information': ['diplomacy'],
		'make-an-impression': ['diplomacy'],
		'request': ['diplomacy'],
		'coerce': ['intimidation'],
		'demoralize': ['intimidation'],
		'treat-disease': ['medicine'],
		'treat-poison': ['medicine'],
		'administer-first-aid': ['medicine'],
		'treat-wounds': ['medicine'],
		'command-an-animal': ['nature'],
		'identify-magic': ['arcana', 'occultism', 'religion', 'nature'], // Ensure this is correctly mapped
		'learn-a-spell': ['arcana', 'occultism', 'religion', 'nature'],
		'recall-knowledge': ['arcana', 'occultism', 'society', 'religion', 'acrobatics', 'athletics', 'crafting', 'deception', 'diplomacy', 'intimidation', 'medicine', 'nature', 'performance', 'stealth', 'survival', 'thievery'],
		'sense-motive': ['perception'],
		'sense-direction': ['survival'],
		'track': ['survival'],
		'subsist': ['survival', 'society'],
		'pick-a-lock': ['thievery'],
		'disable-device': ['thievery'],
		'palm-an-object': ['thievery'],
		'steal': ['thievery'],
		'climb': ['athletics'],
		'force-open': ['athletics'],
		'grapple': ['athletics'],
		'high-jump': ['athletics'],
		'long-jump': ['athletics'],
		'shove': ['athletics'],
		'swim': ['athletics'],
		'trip': ['athletics'],
		'disarm': ['athletics'],
		'escape': ['acrobatics', 'athletics', 'thievery'],
		'lift-an-object': ['athletics'],
		'perform': ['performance'],
		'create-a-diversion': ['deception'],
		'arrest-a-fall': ['acrobatics', 'reflex'],
		'decipher-writing': ['arcana', 'occultism', 'society', 'religion'],
		'grab-an-edge': ['acrobatics', 'reflex'],
	};

	skillsToRoll.forEach(skillName => {
		if (skillName) {
			const action = game.pf2e.actions.get(skillName.split(':')[0]);
			let statistics = multiStatisticActions[skillName] || [skillName];

			// Check if the action has a specific statistic mapping
			if (actionToStatisticMap[skillName]) {
				statistics = actionToStatisticMap[skillName];
			}

			// If the action is 'recall-knowledge', include all skills and lore skills
			if (skillName === 'recall-knowledge') {
				statistics = [
					'arcana', 'occultism', 'society', 'religion', 'acrobatics', 'athletics', 'crafting', 'deception', 'diplomacy', 'intimidation', 'medicine', 'nature', 'performance', 'stealth', 'survival', 'thievery',
					...Object.keys(actor.system.skills).filter(skill => actor.system.skills[skill]?.lore)
				];
			}

			statistics.forEach(statistic => {
				const option = document.createElement('option');
				let skillModifier = 0;
				if (action && action.statistic) {
					const stat = Array.isArray(action.statistic) ? action.statistic[0] : action.statistic;
					skillModifier = getModifierForStatistic(actor, statistic, skills, saves, otherAttributes);
				} else {
					skillModifier = getModifierForStatistic(actor, statistic, skills, saves, otherAttributes);
				}
				console.log(`Skill: ${skillName}, Statistic: ${statistic}, Modifier: ${skillModifier}`);
				option.value = `${skillName}:${statistic}`;
				option.textContent = `${toTitleCase(formatSkillName(skillName.replace(/-/g, ' ')))} (${toTitleCase(statistic.replace(/-/g, ' '))}) (${skillModifier >= 0 ? '+' : ''}${skillModifier})`;
				skillSelect.appendChild(option);
			});
		}
	});

	return skillSelect;
}

const actionOverrides = {
	'track': {
		hasVariants: false
	},
	// Add more overrides as needed
};

const namespace = 'module.pf2e-roll-manager';

function initializeSocketListener() {
	console.log('Registering socket listener for namespace:', namespace);
	game.socket.on(namespace, async (data) => {
		console.log('Received data from socket:', data);
		if (data.type === 'test') {
			console.log('Test message received:', data.text);
		} else if (data.type === 'generateCharacterRollBoxes') {
			const {selectedCharacters, skillsToRoll, dc, isBlindGM} = data;
			const characters = await Promise.all(selectedCharacters.map(async (uuid) => await fromUuid(uuid))); // Use UUID
			await generateCharacterRollBoxes(characters, skillsToRoll, dc, isBlindGM);
		} else if (data.type === 'updateRollResult') {
			const {actorId, skillOrSaveKey, result, dc, isBlindRoll} = data.data;
			await updateRollResultInCharacterBox({actorId, skillOrSaveKey, dc, result, isBlindRoll});
		}
	});
	// Send a test message upon initialization
	game.socket.emit(namespace, {type: 'test', text: 'Socket communication test successful!'});
}

function notifyTokenRequired(actorName) {
	ui.notifications.warn(`No active token found for actor ${actorName}. Please ensure the token is placed on the active scene for the roll manager to function correctly.`);
}

function getSkills(actor) {
	// console.log('Actor Skills Data:', actor.system.skills); // Log the skills object within actor.system
	const skills = actor.system?.skills || {}; // Using optional chaining to access system.skills
	const skillData = {};
	for (const [key, value] of Object.entries(skills)) {
		skillData[key] = value.totalModifier ?? 0; // Directly accessing totalModifier
	}
	return skillData;
}

function getSaves(actor) {
	// console.log('Actor Saves Data:', actor.system.saves); // Log the saves object within actor.system
	const saves = actor.system?.saves || {}; // Using optional chaining to access system.saves
	const saveData = {};
	for (const [key, value] of Object.entries(saves)) {
		saveData[key] = value.totalModifier ?? 0; // Directly accessing totalModifier
	}
	return saveData;
}

function getOtherAttributes(actor) {
	// console.log('Actor Attributes Data:', actor.system.attributes); // Log the attributes object within actor.system
	const perception = actor.system?.perception?.totalModifier ?? 0; // Correct path to access perception totalModifier
	return {perception: perception};
}

function getModifierForStatistic(actor, statistic, skills, saves, otherAttributes) {
	let modifier = 0;
	const lowerCaseStatistic = statistic.toLowerCase();

	if (skills.hasOwnProperty(lowerCaseStatistic)) {
		modifier = skills[lowerCaseStatistic];
	} else if (saves.hasOwnProperty(lowerCaseStatistic)) {
		modifier = saves[lowerCaseStatistic];
	} else if (lowerCaseStatistic === 'perception') {
		modifier = otherAttributes.perception;
	} else if (actor.system.skills[lowerCaseStatistic]?.lore) {
		modifier = actor.system.skills[lowerCaseStatistic].totalModifier;
	}

	return modifier;
}

function getRecallKnowledgeSkills(actor) {
	console.log(`Getting Recall Knowledge skills for actor: ${actor.name}`);
	const skills = actor.system.skills || {};
	const recallKnowledgeSkills = {};
	for (const [key, value] of Object.entries(skills)) {
		if (value.lore) {
			recallKnowledgeSkills[key] = value;
		}
	}
	console.log(`Recall Knowledge skills for ${actor.name}:`, recallKnowledgeSkills);
	return recallKnowledgeSkills;
}

let selectedCharacterUUIDs = new Set();

function attachCharacterSelectionListeners(container) {
	console.log("Attaching character selection listeners...");
	container.querySelectorAll('.character-select-button').forEach(button => {
		console.log("Attaching listener to button:", button);
		button.addEventListener('click', (event) => {
			const button = event.currentTarget;
			const actorUuid = button.dataset.actorUuid;
			console.log("Button clicked:", button);
			if (selectedCharacterUUIDs.has(actorUuid)) {
				selectedCharacterUUIDs.delete(actorUuid);
				button.classList.remove('selected');
			} else {
				selectedCharacterUUIDs.add(actorUuid);
				button.classList.add('selected');
			}
			console.log("Selected character UUIDs:", Array.from(selectedCharacterUUIDs));
		});
	});
}

function updateCharacterSelectionGrid() {
	console.log("Updating character selection grid...");
	const characterSelectionGrid = document.querySelector('.character-selection-grid');
	if (!characterSelectionGrid) {
		console.log("Character selection grid not found.");
		return;
	}

	characterSelectionGrid.querySelectorAll('.character-select-button').forEach(button => {
		const actorUuid = button.dataset.actorUuid;
		if (selectedCharacterUUIDs.has(actorUuid)) {
			button.classList.add('selected');
		} else {
			button.classList.remove('selected');
		}
	});
}

function handleRollResults(results) {
	console.log("Roll results:", results);
	// You can add more logic here to handle the results as needed
}

Hooks.once('ready', () => {

	console.log("\n" +
		"░██████╗░███╗░░██╗██╗░░░██╗  ████████╗███████╗██████╗░██████╗░██╗░░░██╗\n" +
		"██╔════╝░████╗░██║██║░░░██║  ╚══██╔══╝██╔════╝██╔══██╗██╔══██╗╚██╗░██╔╝\n" +
		"██║░░██╗░██╔██╗██║██║░░░██║  ░░░██║░░░█████╗░░██████╔╝██████╔╝░╚████╔╝░\n" +
		"██║░░╚██╗██║╚████║██║░░░██║  ░░░██║░░░██╔══╝░░██╔══██╗██╔══██╗░░╚██╔╝░░\n" +
		"╚██████╔╝██║░╚███║╚██████╔╝  ░░░██║░░░███████╗██║░░██║██║░░██║░░░██║░░░\n" +
		"░╚═════╝░╚═╝░░╚══╝░╚═════╝░  ░░░╚═╝░░░╚══════╝╚═╝░░╚═╝╚═╝░░╚═╝░░░╚═╝░░░\n" +
		"\n" +
		"██████╗░██████╗░░█████╗░████████╗░█████╗░██╗░░██╗███████╗████████╗████████╗\n" +
		"██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██║░░██║██╔════╝╚══██╔══╝╚══██╔══╝\n" +
		"██████╔╝██████╔╝███████║░░░██║░░░██║░░╚═╝███████║█████╗░░░░░██║░░░░░░██║░░░\n" +
		"██╔═══╝░██╔══██╗██╔══██║░░░██║░░░██║░░██╗██╔══██║██╔══╝░░░░░██║░░░░░░██║░░░\n" +
		"██║░░░░░██║░░██║██║░░██║░░░██║░░░╚█████╔╝██║░░██║███████╗░░░██║░░░░░░██║░░░\n" +
		"╚═╝░░░░░╚═╝░░╚═╝╚═╝░░╚═╝░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝╚══════╝░░░╚═╝░░░░░░╚═╝░░░")

	console.log("A person whose name is still spoken isn't dead.")

	initializeSocketListener();
	saveFoundrySettings();
	// Define the button template for the command palette
	const commandButton = $('<div class="control-icon"><i class="fas fa-dice-d20" title="Open Action Dropdown"></i></div>');
	// Append the button to the command palette
	$('#controls').prepend(commandButton);
	// Add a click event to the button to trigger the createActionDropdown function
	commandButton.on('click', () => {
		createActionDropdown({
			excludeActions: ["administer-first-aid", "create-a-diversion", "perform", "delay"]
		});
	});
});

Hooks.on('getSceneControlButtons', (controls) => {
	let tokenControls = controls.find(c => c.name === "token");
	if (tokenControls) {
		tokenControls.tools.push({
			name: "pf2eRollManager",
			title: "PF2E Roll Manager - GM Setup",
			icon: "fas fa-dice", // Changed to dice icon
			class: "custom-tool-button", // Added custom class
			button: true,
			onClick: () => {
				createActionDropdown({
					excludeActions: ["administer-first-aid", "create-a-diversion", "perform", "delay"]
				});
			}
		});
	}
});

function buildCharacterVisibilityDialog() {
	const playerCharacters = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
	const hiddenCharacters = JSON.parse(localStorage.getItem('hiddenCharacters')) || [];

	const content = `
    <form>
      ${playerCharacters.map(actor => {
		const isChecked = hiddenCharacters.includes(actor.uuid) ? 'checked' : '';
		return `
          <div class="character-visibility-item">
            <input type="checkbox" id="visibility-${actor.uuid}" data-actor-uuid="${actor.uuid}" ${isChecked} />
            <label for="visibility-${actor.uuid}">${actor.name}</label>
          </div>
        `;
	}).join('\n')}
    </form>
  `;

	const dialog = new Dialog({
		title: "Select which characters to hide. Reload Roll Manager After.",
		content: content,
		buttons: {
			save: {
				label: "Save",
				callback: (html) => {
					const hiddenCharacters = Array.from(html.find('input[type="checkbox"]:checked')).map(el => el.dataset.actorUuid);
					localStorage.setItem('hiddenCharacters', JSON.stringify(hiddenCharacters));
					updateCharacterSelectionGrid();
				}
			},
			cancel: {
				label: "Cancel"
			}
		},
		default: "save",
		render: (html) => {
			// Additional rendering logic if needed
		},
		close: () => {
			// Additional close logic if needed
		}
	});

	dialog.render(true);
}

async function createActionDropdown({
	                                    gameSystem = game.pf2e,
	                                    defaultDC = 15,
	                                    defaultRollMode = "publicroll",
	                                    defaultCreateMessage = true,
	                                    defaultSkipDialog = false,
	                                    excludeActions = [],
                                    } = {}) {
	const actions = gameSystem.actions;
	if (!actions) {
		console.error("Game system actions not found.");
		return;
	}

	// Function to calculate default DC based on level
	function calculateDefaultDC(level) {
		const dcByLevel = [
			14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 32, 33, 34, 36, 37, 38, 40, 42, 44, 46, 48, 50
		];
		if (level < 0) return dcByLevel[0];
		if (level >= dcByLevel.length) return dcByLevel[dcByLevel.length - 1];
		return dcByLevel[level];
	}

	// Determine the default DC based on the level of the selected actors
	const selectedActors = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
	const highestLevel = Math.max(...selectedActors.map(actor => actor.system.details.level.value));
	defaultDC = calculateDefaultDC(highestLevel);

	const groupedActions = {};
	for (const [key, action] of actions.entries()) {
		if (excludeActions.includes(key)) {
			if (action.variants) {
				for (const variant of action.variants) {
					const stat = action.statistic ? action.statistic : 'unknown';
					if (!groupedActions[stat]) {
						groupedActions[stat] = [];
					}
					groupedActions[stat].push({
						name: `${game.i18n.localize(action.name)} (${game.i18n.localize(variant.name)})`,
						slug: `${key}:${variant.slug}`
					});
				}
			}
		} else {
			if (!action.statistic || action.statistic === "unknown") continue;
			const stat = Array.isArray(action.statistic) ? 'Multiple' : action.statistic;
			if (!groupedActions[stat]) {
				groupedActions[stat] = [];
			}
			groupedActions[stat].push({name: game.i18n.localize(action.name), slug: key});
			if (action.variants) {
				for (const variant of action.variants) {
					groupedActions[stat].push({
						name: `${game.i18n.localize(action.name)} (${game.i18n.localize(variant.name)})`,
						slug: `${key}:${variant.slug}`
					});
				}
			}
		}
	}

	// Helper function to transform labels
	function transformLabel(label) {
		return toTitleCase(label.replace(/-/g, ' '));
	}

	const majorSkills = [
		{name: 'Acrobatics', slug: 'acrobatics'},
		{name: 'Arcana', slug: 'arcana'},
		{name: 'Athletics', slug: 'athletics'},
		{name: 'Crafting', slug: 'crafting'},
		{name: 'Deception', slug: 'deception'},
		{name: 'Diplomacy', slug: 'diplomacy'},
		{name: 'Intimidation', slug: 'intimidation'},
		{name: 'Medicine', slug: 'medicine'},
		{name: 'Nature', slug: 'nature'},
		{name: 'Occultism', slug: 'occultism'},
		{name: 'Performance', slug: 'performance'},
		{name: 'Religion', slug: 'religion'},
		{name: 'Society', slug: 'society'},
		{name: 'Stealth', slug: 'stealth'},
		{name: 'Survival', slug: 'survival'},
		{name: 'Thievery', slug: 'thievery'}
	];

	const buildSkillButtonsHtml = (skills, prefix = '') => `
  ${skills.map(a => `
    <button type="button" class="skill-button" data-slug="${a.slug}">
      ${prefix}${toTitleCase(transformLabel(a.name))}
    </button>
  `).join('\n')}
`;

	const buildDcAdjustmentButtons = (initialDC) => `
  <div class="dc-adjustment-buttons flex-container">
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC - 10}">-10</button>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC - 5}">-5</button>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC - 2}">-2</button>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC - 1}">-1</button>
    <div class="dc-input-box">
      <input type="number" id="dc-input" placeholder="Current DC" value="${initialDC}" min="1" max="60" />
    </div>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC + 1}">+1</button>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC + 2}">+2</button>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC + 5}">+5</button>
    <button type="button" class="dc-adjustment-button" data-dc="${initialDC + 10}">+10</button>
  </div>
`;

	const buildStandardDcButtons = () => {
		const dcs = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
		const labels = ["Untrained", "Trained", "Expert", "Skilled", "Master", "Veteran", "Legendary", "Mythic", "Epic", "Supreme", "Ultimate"];
		const combined = dcs.map((dc, index) => `
    <div class="standard-dc-item flex-container">
      <button type="button" class="standard-dc-button" data-dc="${dc}">
        <span class="dc-label">${toTitleCase(labels[index])}</span><br>${dc}
      </button>
    </div>
  `).join('\n');
		return `<div class="standard-dc-buttons flex-container">${combined}</div>`;
	};

	function buildCharacterSelectionHtml() {
		const playerCharacters = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
		const hiddenCharacters = JSON.parse(localStorage.getItem('hiddenCharacters')) || [];
		return `
    ${playerCharacters.filter(actor => !hiddenCharacters.includes(actor.uuid)).map(actor => {
			const tokenImage = actor.prototypeToken.texture.src;
			return `
        <div class="character-selection">
          <input type="checkbox" id="checkbox-${actor.uuid}" style="display: none;" />
          <button type="button" class="skill-button character-select-button" id="button-${actor.uuid}" data-actor-uuid="${actor.uuid}">
            <img src="${tokenImage}" alt="${actor.name}" class="character-token-image">
            ${actor.name}
          </button>
        </div>
      `;
		}).join('\n')}
  `;
	}

	const initialDC = defaultDC;
	const majorSkillButtonsHtml = buildSkillButtonsHtml(majorSkills);
	const skillButtonsHtml = Object.keys(groupedActions).sort().map(stat => {
		const group = groupedActions[stat];
		return `
    <details id="stat-section-${stat}" class="stat-section details-section">
      <summary class="details-summary">${toTitleCase(game.i18n.localize(stat))}</summary>
      <div class="stat-section-content">
        <div class="skill-buttons-row flex-container">${buildSkillButtonsHtml(group)}</div>
      </div>
    </details>
  `;
	}).join('\n');

	const characterSelection = buildCharacterSelectionHtml();
	const recallKnowledgeSkills = majorSkills.concat(
		game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character")
			.flatMap(actor => Object.keys(getRecallKnowledgeSkills(actor)).map(lore => ({name: lore, slug: lore})))
	);

	const recallKnowledgeButtonsHtml = buildSkillButtonsHtml(recallKnowledgeSkills, 'Recall Knowledge: ');

	const content = `
  <form>
    <input type="text" id="search-bar" placeholder="Search for skill or character..." style="margin-bottom: 10px; width: 100%; padding: 5px;">
    <details id="skill-save-section" class="details-section">
      <summary class="details-summary">Perception, Skills, Actions, and Saving Throws</summary>
      <div class="skill-form-group flex-container">
        ${buildSkillButtonsHtml([{name: 'Perception', slug: 'perception'}])}
        ${majorSkillButtonsHtml}
        ${skillButtonsHtml}
        <details id="saving-throws-section" class="details-section">
          <summary class="details-summary">Saving Throws</summary>
          <div class="skill-buttons-row flex-container">
            ${buildSkillButtonsHtml([
		{name: 'Fortitude Save', slug: 'fortitude'},
		{name: 'Reflex Save', slug: 'reflex'},
		{name: 'Will Save', slug: 'will'},
	])}
          </div>
        </details>
      </div>
    </details>
    <hr />
    <details id="dc-section" class="details-section">
      <summary class="details-summary">DC Adjustments</summary>
      <div class="skill-form-group">
        <div class="dc-slider-container slider-container">
          <input type="range" id="dc-slider" name="dc" min="1" max="60" value="${initialDC}" />
        </div>
        <div class="dc-container flex-container">
          ${buildStandardDcButtons()}
        </div>
        <div class="buildDcAdjustmentButtons flex-container">
          ${buildDcAdjustmentButtons(initialDC)}
        </div>
      </div>
    </details>
    <hr />
    <details id="character-selection-section" class="details-section">
      <summary class="details-summary">Character Selection</summary>
      <div class="character-selection-grid flex-container">${characterSelection}</div>
      <button type="button" id="character-visibility-button">Manage Character Visibility</button>
    </details>
    <hr />
    <div class="kofi-donation">
      <label> Want to support this module? Please consider a <a href="https://ko-fi.com/mythicamachina">donation</a> to help pay for development. </label>
      <a href="https://ko-fi.com/mythicamachina">
        <img src="modules/pf2e-roll-manager/img/kofilogo.png" alt="Ko-Fi Logo" style="height: 25px; border: none;" />
      </a>
    </div>
    <div><hr></div>
  </form>
`;


	const dialog = new Dialog({
		title: "PF2E Roll Manager - GM Setup",
		content: content,
		buttons: {
			roll: {
				label: "Roll",
				callback: async (html) => {
					const dc = parseInt(html.find('#dc-slider').val()) || defaultDC;
					let selectedActions = Array.from(html.find('.skill-button.selected')).map(el => el.dataset.slug).filter(slug => typeof slug === 'string');
					let selectedCharacterUUIDs = Array.from(html.find('.character-select-button.selected')).map(el => el.dataset.actorUuid);
					console.log("Selected character UUIDs:", selectedCharacterUUIDs);
					let selectedActors = await Promise.all(selectedCharacterUUIDs.map(async (uuid) => {
						let actor = await fromUuid(uuid);
						if (!actor) {
							console.warn(`Actor not found for UUID: ${uuid}`);
						}
						return actor;
					}));
					selectedActors = selectedActors.filter(actor => actor !== undefined);
					console.log("Selected actors:", selectedActors);
					if (!selectedActions.length) {
						ui.notifications.warn("No actions selected.");
						return;
					}
					if (!selectedActors.length) {
						ui.notifications.warn("No characters selected.");
						return;
					}
					game.socket.emit(namespace, {
						type: 'generateCharacterRollBoxes',
						selectedCharacters: selectedActors.map(actor => actor.uuid),
						skillsToRoll: selectedActions,
						dc,
						isBlindGM: false
					}); // Use UUID
					await generateCharacterRollBoxes(selectedActors, selectedActions, dc, false);
				}
			},
			instantRoll: {
				label: "Instant Roll",
				callback: async (html) => {
					const dc = parseInt(html.find('#dc-slider').val()) || defaultDC;
					let selectedActions = Array.from(html.find('.skill-button.selected')).map(el => el.dataset.slug).filter(slug => typeof slug === 'string');
					let selectedCharacterUUIDs = Array.from(html.find('.character-select-button.selected')).map(el => el.dataset.actorUuid);
					if (!selectedActions.length) {
						ui.notifications.warn("No actions selected.");
						return;
					}
					if (!selectedCharacterUUIDs.length) {
						ui.notifications.warn("No characters selected.");
						return;
					}
					let selectedActors = await Promise.all(selectedCharacterUUIDs.map(async (uuid) => {
						let actor = await fromUuid(uuid);
						if (!actor) {
							console.warn(`Actor not found for UUID: ${uuid}`);
						}
						return actor;
					}));
					selectedActors = selectedActors.filter(actor => actor !== undefined);
					console.log("Selected actors:", selectedActors);
					executeInstantRoll(selectedActors, selectedActions, dc, defaultCreateMessage, defaultSkipDialog, 'blindroll', null, true, {secret: true}); // Pass true for fromDialog and add secret option
				}
			},
			blindGM: {
				label: "Blind GM Roll",
				callback: async (html) => {
					const dc = parseInt(html.find('#dc-slider').val()) || defaultDC;
					let selectedActions = Array.from(html.find('.skill-button.selected')).map(el => el.dataset.slug).filter(slug => typeof slug === 'string');
					let selectedCharacterUUIDs = Array.from(html.find('.character-select-button.selected')).map(el => el.dataset.actorUuid);
					console.log("Selected character UUIDs:", selectedCharacterUUIDs);
					let selectedActors = await Promise.all(selectedCharacterUUIDs.map(async (uuid) => {
						let actor = await fromUuid(uuid);
						if (!actor) {
							console.warn(`Actor not found for UUID: ${uuid}`);
						}
						return actor;
					}));
					selectedActors = selectedActors.filter(actor => actor !== undefined);
					console.log("Selected actors:", selectedActors);
					if (!selectedActions.length) {
						ui.notifications.warn("No actions selected.");
						return;
					}
					if (!selectedActors.length) {
						ui.notifications.warn("No characters selected.");
						return;
					}
					game.socket.emit(namespace, {
						type: 'generateCharacterRollBoxes',
						selectedCharacters: selectedActors.map(actor => actor.uuid),
						skillsToRoll: selectedActions,
						dc,
						isBlindGM: true
					}); // Use UUID
					await generateCharacterRollBoxes(selectedActors, selectedActions, dc, true);
				}
			},
			cancel: {
				label: "Cancel"
			}
		},
		default: "roll",
		render: (html) => {
			restoreCollapsibleState();
			const updateDC = (value) => {
				value = Math.min(Math.max(value, 1), 60);
				html.find('#dc-slider-value').text(value);
				html.find('#dc-slider').val(value);
				html.find('#dc-input').val(value);
			};
			html.find('#dc-slider').on('input', (event) => updateDC(event.target.value));
			html.find('#dc-input').on('change', (event) => updateDC(event.target.value));
			html.find('.dc-adjustment-button').on('click', (event) => updateDC(event.target.dataset.dc));
			html.find('.standard-dc-button').on('click', (event) => updateDC(event.target.dataset.dc));
			html.find('.skill-button').on('click', (event) => {
				$(event.currentTarget).toggleClass('selected');
			});
			console.log("Calling attachCharacterSelectionListeners...");
			attachCharacterSelectionListeners(html.find('.character-selection-grid')[0]);
			const searchBar = html.find('#search-bar');
			searchBar.on('input', () => {
				const searchTerm = searchBar.val().toLowerCase();
				html.find('.skill-button, .character-select-button').each((_, button) => {
					const label = $(button).text().toLowerCase();
					const isVisible = label.includes(searchTerm);
					$(button).toggle(isVisible);
					$(button).closest('.stat-section').prop('open', true);
				});
				html.find('.stat-section').each((_, section) => {
					const hasVisibleButtons = $(section).find('.skill-button:visible').length > 0;
					$(section).prop('open', hasVisibleButtons || searchTerm === '');
				});
			});
			html.find('#character-visibility-button').on('click', () => {
				buildCharacterVisibilityDialog();
			});
			updateCharacterSelectionGrid();
			setTimeout(() => {
				const dialogElement = html.closest('.app.dialog');
				dialogElement.css({'width': '50%', 'height': '50%'});
				dialogElement.find('.window-content').css({'height': 'calc(100% - 30px)'});
			}, 10);
		},
		close: () => {
			saveCollapsibleState();
		},
		options: {width: 500, height: 500, resizable: true}
	});

	dialog.render(true);
}

function toTitleCase(str) {
	return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function saveCollapsibleState() {
	const sections = document.querySelectorAll('details');
	sections.forEach(section => {
		localStorage.setItem(`collapse-state-${section.id}`, section.open);
	});
}

function restoreCollapsibleState() {
	const sections = document.querySelectorAll('details');
	sections.forEach(section => {
		const state = localStorage.getItem(`collapse-state-${section.id}`);
		if (state) {
			section.open = JSON.parse(state);
		}
	});
}

async function executeInstantRoll(selectedActors, selectedActions, dc, createMessage, skipDialog, rollMode, selectedStatistic, fromDialog = false) {
	console.log("Executing instant roll with parameters:", {
		selectedActors,
		selectedActions,
		dc,
		createMessage,
		skipDialog,
		rollMode,
		selectedStatistic,
		fromDialog
	});
	const isBlindRoll = rollMode === 'blindroll';
	const results = [];
	for (const actor of selectedActors) {
		for (const selectedSlug of selectedActions) {
			let actionSlug, statistic;
			if (selectedSlug.includes(':')) {
				[actionSlug, statistic] = selectedSlug.split(':');
			} else {
				actionSlug = selectedSlug;
				statistic = null;
			}
			console.log(`Processing action: ${actionSlug}, statistic: ${statistic}`);
			// Check if the action is listed under 'Multiple' and if it was selected from the initial dialog
			if (multiStatisticActions[actionSlug] && fromDialog) {
				ui.notifications.warn(`The action "${actionSlug}" cannot be used with Instant Roll. Please select a specific skill.`);
				return;
			}
			const tokens = actor.getActiveTokens(true);
			if (tokens.length > 0) {
				const token = tokens[0];
				console.log(`Token found for actor ${actor.name}:`, token);
				token.control({releaseOthers: true});
			} else {
				console.error(`No active token found for actor ${actor.name} with UUID ${actor.uuid}`);
				ui.notifications.error(`No active token found for actor ${actor.name} with UUID ${actor.uuid}.`);
				continue;
			}
			let result;
			try {
				const rollOptions = {event: new Event('click'), rollMode, createMessage, secret: isBlindRoll};
				if (actionSlug === 'recall-knowledge' && statistic) {
					console.log(`Handling Recall Knowledge action with specific lore: ${statistic}`);
					const skillSlug = statistic.toLowerCase().replace(/ /g, '-');
					console.log(`Rolling Recall Knowledge or Lore skill: ${skillSlug}`);
					result = await executeSkillRoll(actor, skillSlug, dc, rollOptions);
				} else if (['subsist', 'decipher-writing'].includes(actionSlug) && statistic) {
					console.log(`Handling ${actionSlug} action with specific skill: ${statistic}`);
					const skillSlug = statistic.toLowerCase().replace(/ /g, '-');
					console.log(`Rolling ${actionSlug} skill: ${skillSlug}`);
					result = await executeSkillRoll(actor, skillSlug, dc, rollOptions);
				} else if (actionSlug === 'identify-magic' && statistic) {
					console.log(`Handling Identify Magic action with specific skill: ${statistic}`);
					const skillSlug = statistic.toLowerCase().replace(/ /g, '-');
					console.log(`Rolling Identify Magic skill: ${skillSlug}`);
					result = await executeSkillRoll(actor, skillSlug, dc, rollOptions);
				} else if (['perception'].includes(actionSlug)) {
					result = await executePerceptionRoll(actor, dc, rollOptions);
				} else if (['acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy', 'intimidation', 'medicine', 'nature', 'occultism', 'performance', 'religion', 'society', 'stealth', 'survival', 'thievery'].includes(actionSlug)) {
					const skillSlug = actionSlug.toLowerCase().replace(/ /g, '-');
					console.log(`Rolling skill: ${skillSlug}`);
					result = await executeSkillRoll(actor, skillSlug, dc, rollOptions);
				} else if (['fortitude', 'reflex', 'will'].includes(actionSlug.toLowerCase())) {
					result = await executeSaveRoll(actor, actionSlug.toLowerCase(), dc, rollOptions);
				} else {
					console.log(`Executing action roll for: ${actionSlug}`);
					result = await executeActionRoll(actor, actionSlug, statistic, dc, rollOptions, selectedStatistic);
				}
				if (result) {
					const formattedResult = formatResultForSocket(result);
					formattedResult.dc = dc;
					if (isBlindRoll) {
						formattedResult.total = '???';
						formattedResult.degreeOfSuccess = '???';
					}
					if (game.user.isGM || !isBlindRoll) {
						await updateRollResultInCharacterBox({
							actorId: actor.uuid,
							skillOrSaveKey: `${actionSlug}:${statistic}`,
							dc,
							result: formattedResult,
							isBlindRoll
						});
					}
					game.socket.emit(namespace, {
						type: 'updateRollResult',
						data: {
							actorId: actor.uuid,
							skillOrSaveKey: `${actionSlug}:${statistic}`,
							dc,
							result: formattedResult,
							isBlindRoll
						}
					});
					results.push({
						actorId: actor.uuid,
						skillOrSaveKey: `${actionSlug}:${statistic}`,
						dc,
						result: formattedResult,
						isBlindRoll
					});
				}
			} catch (error) {
				console.error(`Error executing roll for ${actionSlug}:`, error);
				ui.notifications.error(`Failed to execute roll for ${actionSlug}. See console for details.`);
			}
		}
	}
	handleRollResults(results);
}

function formatActionResult(resultArray) {
	console.log('Raw action result before formatting:', resultArray);

	// Ensure we are dealing with an array and access the first element
	const result = Array.isArray(resultArray) ? resultArray[0] : resultArray;
	console.log('Processed result object:', result);

	let total = 0;
	let degreeOfSuccess = 0;

	// Check if the result object has a roll property
	if (result.roll) {
		console.log('Found roll object:', result.roll);
		total = result.roll._total ?? 0;
		degreeOfSuccess = result.roll.degreeOfSuccess ?? 0;
		console.log('Extracted from roll object - Total:', total, 'Degree of Success:', degreeOfSuccess);
	}
	// Check if the result object has a message property with rolls
	else if (result.message) {
		console.log('Found message object:', result.message);
		if (result.message.rolls && result.message.rolls.length > 0) {
			console.log('Found rolls in message object:', result.message.rolls);
			const actionRoll = result.message.rolls[0];
			total = actionRoll._total ?? 0;
			degreeOfSuccess = actionRoll.degreeOfSuccess ?? 0;
			console.log('Extracted from message object - Total:', total, 'Degree of Success:', degreeOfSuccess);
		} else {
			console.warn('Message object does not contain rolls or rolls array is empty.');
		}
	}
	// Fallback values
	else {
		console.warn('Neither roll object nor message object with rolls found. Using fallback values.');
		total = result.total ?? 0;
		degreeOfSuccess = result.degreeOfSuccess ?? 0;
		console.log('Fallback values - Total:', total, 'Degree of Success:', degreeOfSuccess);
	}

	// Log the final formatted result
	const formattedResult = {
		total,
		degreeOfSuccess,
		diceResults: result.roll?.diceResults || [],
		isBlindGM: result.blind ?? false,
		isSecret: result.secret ?? false
	};
	console.log('Formatted result:', formattedResult);

	return formattedResult;
}

async function executeSkillRoll(actor, skillSlug, dc, rollOptions) {
	console.log(`Executing skill roll for actor: ${actor.name}, skill: ${skillSlug}, dc: ${dc}, rollOptions:`, rollOptions);
	try {
		const roll = await actor.skills[skillSlug].roll(rollOptions);
		console.log(`Skill roll result for ${skillSlug}:`, roll);
		return {total: roll.total, outcome: determineOutcome(roll.total, dc), roll};
	} catch (error) {
		console.error(`Error rolling skill ${skillSlug}:`, error);
		ui.notifications.error(`Failed to roll skill ${skillSlug}. See console for details.`);
		return null;
	}
}

async function executePerceptionRoll(actor, dc, rollOptions) {
	try {
		const roll = await actor.perception.roll(rollOptions);
		return {total: roll.total, outcome: determineOutcome(roll.total, dc), roll};
	} catch (error) {
		console.error(`Error rolling perception:`, error);
		ui.notifications.error(`Failed to roll perception. See console for details.`);
		return null;
	}
}

async function executeSaveRoll(actor, saveSlug, dc, rollOptions) {
	try {
		const roll = await actor.saves[saveSlug].roll(rollOptions);
		return {total: roll.total, outcome: determineOutcome(roll.total, dc), roll};
	} catch (error) {
		console.error(`Error rolling save ${saveSlug}:`, error);
		ui.notifications.error(`Failed to roll save ${saveSlug}. See console for details.`);
		return null;
	}
}

async function executeActionRoll(actor, actionSlug, variantSlug, dc, rollOptions, selectedStatistic) {
	try {
		const action = game.pf2e.actions.get(actionSlug);
		if (!action) {
			throw new Error(`Action ${actionSlug} not found.`);
		}
		// Temporarily select the token that the actor owns in the scene
		const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
		if (token) {
			token.control({releaseOthers: true});
		} else {
			throw new Error(`No token found for actor ${actor.name}`);
		}
		const useOptions = {...rollOptions, difficultyClass: dc, skipDialog: true, actor};
		// Apply overrides if they exist
		if (actionOverrides[actionSlug]) {
			const override = actionOverrides[actionSlug];
			if (override.hasVariants === false) {
				variantSlug = null; // Ensure no variant is used
			} else if (override.variants && !variantSlug) {
				variantSlug = override.variants[0];
			}
		}
		// Handle specific actions that should not use variants
		if (actionSlug === "identify-magic" || actionSlug === "recall-knowledge") {
			if (!selectedStatistic) {
				throw new Error(`The ${toTitleCase(actionSlug.replace(/-/g, ' '))} action can be used with different statistics, and no statistic was specified.`);
			}
			useOptions.statistic = selectedStatistic;
			variantSlug = null; // Ensure no variant is used
		}
		let result;
		try {
			// Attempt to use the action without any variant first
			result = await action.use(useOptions);
		} catch (error) {
			console.warn(`Failed to execute action ${actionSlug} without variant. Trying with variant if available.`, error);
			if (variantSlug) {
				useOptions.variant = variantSlug;
				result = await action.use(useOptions);
			} else {
				throw error; // Re-throw the error if no variant is available
			}
		}
		return formatActionResult(result);
	} catch (error) {
		console.error(`Error executing action ${actionSlug}:`, error);
		ui.notifications.error(`Failed to execute action ${actionSlug}. See console for details.`);
		return null;
	}
}

function formatResultForSocket(result) {
	console.log('Raw result before formatting:', result);
	let total = 0;
	let degreeOfSuccess = 0;
	let dc = result.dc || null;
	if (result.roll && result.outcome) {
		total = result.roll.total ?? 0;
		switch (result.outcome) {
			case 'criticalSuccess':
				degreeOfSuccess = 3;
				break;
			case 'success':
				degreeOfSuccess = 2;
				break;
			case 'failure':
				degreeOfSuccess = 1;
				break;
			case 'criticalFailure':
				degreeOfSuccess = 0;
				break;
		}
	} else if (result.message && result.message.rolls && result.message.rolls[0]) {
		const actionRoll = result.message.rolls[0];
		total = actionRoll._total ?? 0;
		dc = result.dc ?? 15;
		degreeOfSuccess = determineDegreeOfSuccess(total, dc, actionRoll);
	} else {
		total = result.total ?? 0;
		degreeOfSuccess = result.degreeOfSuccess ?? 0;
	}
	return {
		total,
		degreeOfSuccess,
		diceResults: result.roll?.diceResults || [],
		isBlindGM: result.blind ?? false,
		isSecret: result.secret ?? false,
		dc
	};
}

function determineDegreeOfSuccess(total, dc, roll) {
	const natRoll = roll.dice[0]?.results[0]?.result || null;
	let degreeOfSuccess;

	if (natRoll === 1) {
		degreeOfSuccess = Math.max(-1, Math.floor((total - dc) / 10)) - 1; // Decrease by one step, but not below critical failure
	} else if (natRoll === 20) {
		degreeOfSuccess = Math.min(3, Math.floor((total - dc) / 10)) + 1; // Increase by one step
	} else {
		degreeOfSuccess = Math.floor((total - dc) / 10);
	}

	return Math.max(0, Math.min(3, degreeOfSuccess + 2)); // Ensure it's in the range 0 to 3
}

function determineOutcome(total, dc) {
	if (total >= dc + 10) {
		return 'criticalSuccess';
	} else if (total >= dc) {
		return 'success';
	} else if (total >= dc - 10) {
		return 'failure';
	} else {
		return 'criticalFailure';
	}
}

function saveFoundrySettings() {
	game.settings.register("pf2e-roll-manager", "diceRollDelay", {
		name: "Dice Roll Delay",
		hint: "This is the amount of time in milliseconds between pressing the button to roll and getting the result - adjust this if the result appears before the dice animation has finished.",
		scope: "world",
		config: true,
		type: Number,
		default: 3000
	});
	game.settings.register("pf2e-roll-manager", "autoFadeOut", {
		name: "Automatic Fadeout",
		hint: "The amount of time in milliseconds before the interface boxes will automatically fade out once all results have been gathered.",
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});
	game.settings.register("pf2e-roll-manager", "timeBeforeFadeOut", {
		name: "Interface Fadeout Delay",
		hint: "The amount of time in milliseconds before the interface boxes will automatically fade out once all results have been gathered.",
		scope: "world",
		config: true,
		type: Number,
		default: 6000
	});
	game.settings.register("pf2e-roll-manager", "showDCForRoll", {
		name: "Show DC for Rolls",
		hint: "Whether or not the DC should be displayed.",
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});
}

function createIndicator(degreeOfSuccess) {
	const indicator = document.createElement('span');
	switch (degreeOfSuccess) {
		case '???':
			indicator.textContent = "???";
			indicator.style.color = 'gray';
			break;
		case 3:
			indicator.textContent = "✅ Critical Success ✅";
			indicator.style.color = 'green';
			break;
		case 2:
			indicator.textContent = "Success ✅";
			indicator.style.color = 'green';
			break;
		case 1:
			indicator.textContent = "Failure ❌";
			indicator.style.color = 'red';
			break;
		case 0:
			indicator.textContent = "❌ Critical Failure ❌";
			indicator.style.color = 'red';
			break;
		default:
			indicator.textContent = "Unknown result";
			indicator.style.color = 'gray';
	}
	return indicator;
}

async function displayCharacterRollBoxes(selectedCharacters, skillsToRoll, dc, isBlindGM) {
	// Broadcast the creation event to all clients
	game.socket.emit('module.pf2e-roll-manager', {
		type: 'generateCharacterRollBoxes',
		selectedCharacters: selectedCharacters.map(character => character.id),
		skillsToRoll,
		dc,
		isBlindGM
	});

	// Create the character boxes for the GM
	await generateCharacterRollBoxes(selectedCharacters, skillsToRoll, dc, isBlindGM);
}

function createCharacterBox(actor, skillsToRoll, dc, isBlindGM, index, characterBoxes, resultsSummary) {
	const box = document.createElement('div');
	box.className = 'character-box fade-in';
	box.dataset.actorUuid = actor.uuid;
	box.style.margin = '10px';
	box.style.padding = '20px';
	box.style.backgroundColor = 'white';
	box.style.border = '1px solid black';
	box.style.borderRadius = '10px';
	box.style.textAlign = 'center';

	const characterNameHeading = document.createElement('h2');
	characterNameHeading.textContent = actor.name;
	characterNameHeading.style.fontFamily = 'Arial, sans-serif';
	characterNameHeading.style.fontSize = '1.7em';
	characterNameHeading.style.marginBottom = '10px';
	box.appendChild(characterNameHeading);

	const tokenImage = document.createElement('img');
	tokenImage.src = actor.prototypeToken.texture.src;
	tokenImage.alt = actor.name;
	tokenImage.style.width = '150px';
	tokenImage.style.height = '150px';
	tokenImage.style.display = 'block';
	tokenImage.style.margin = '0 auto';
	tokenImage.style.border = '0';
	tokenImage.style.padding = "10px";
	box.appendChild(tokenImage);

	const skills = getSkills(actor);
	const saves = getSaves(actor);
	const otherAttributes = getOtherAttributes(actor);
	const skillSelect = createSkillSelect(actor, skillsToRoll, skills, saves, otherAttributes);
	box.appendChild(skillSelect);

	let rollButton;
	if (!isBlindGM) {
		rollButton = document.createElement('button');
		rollButton.textContent = 'Roll';
		rollButton.style.display = 'block';
		rollButton.style.margin = '10px auto';
		box.appendChild(rollButton);
	}
	const rollBlindButton = document.createElement('button');
	rollBlindButton.textContent = 'Roll Blind GM';
	rollBlindButton.style.display = 'block';
	rollBlindButton.style.margin = '10px auto';
	box.appendChild(rollBlindButton);


	const resultArea = document.createElement('div');
	resultArea.className = 'result-area';
	resultArea.style.marginTop = '10px';
	resultArea.style.minHeight = '20px';
	resultArea.style.backgroundColor = '#f0f0f0';
	resultArea.style.border = '1px solid #ccc';
	resultArea.style.padding = '5px';
	box.appendChild(resultArea);

	const indicatorArea = document.createElement('div');
	indicatorArea.className = 'indicator-area';
	indicatorArea.style.marginTop = '5px';
	box.appendChild(indicatorArea);

	setTimeout(() => {
		box.classList.add('visible');
	}, 50 + index * 20);

	if (!isBlindGM) {
		addRollButtonEventListener(rollButton, actor, skillSelect, box, dc, characterBoxes, resultsSummary);
	}
	addRollBlindButtonEventListener(rollBlindButton, actor, skillSelect, box, dc, characterBoxes, resultsSummary);
	return box;
}

async function updateRollResultInCharacterBox(data) {
	console.log(`Updating roll result in character box for actor: ${data.actorId}`, data);
	const {actorId, skillOrSaveKey, result, isBlindRoll} = data;
	const {degreeOfSuccess, total} = result;
	const characterBox = document.querySelector(`.character-box[data-actor-uuid="${actorId}"]`); // Use UUID instead of ID
	if (!characterBox) {
		console.warn(`Character box for actor UUID ${actorId} not found.`);
		return;
	}
	const resultArea = characterBox.querySelector('.result-area');
	const indicatorArea = characterBox.querySelector('.indicator-area');

	// Retrieve the dice roll delay setting
	const diceRollDelay = game.settings.get("pf2e-roll-manager", "diceRollDelay");

	// Create a promise that resolves when the diceSoNiceRollComplete hook is triggered
	const diceSoNicePromise = new Promise((resolve) => {
		Hooks.once('diceSoNiceRollComplete', resolve);
	});

	// Create a promise that resolves after the dice roll delay
	const delayPromise = new Promise((resolve) => {
		setTimeout(resolve, diceRollDelay);
	});

	// Wait for either the diceSoNiceRollComplete hook or the delay to complete
	await Promise.race([diceSoNicePromise, delayPromise]);

	// Clear previous indicator
	indicatorArea.innerHTML = '';

	// Display the roll result
	resultArea.innerHTML = `<p><strong>Result:</strong> ${isBlindRoll && !game.user.isGM ? '???' : total}</p>`;

	// Create and append the new indicator
	const indicator = createIndicator(isBlindRoll && !game.user.isGM ? '???' : degreeOfSuccess);
	indicatorArea.appendChild(indicator);
}

async function generateCharacterRollBoxes(selectedCharacters, skillsToRoll, dc, isBlindGM) {
	const overlay = createOverlay();
	const container = createContainer();
	const heading = await createHeadingWrapper(skillsToRoll, dc, isBlindGM);
	container.appendChild(heading);
	const boxesContainer = document.createElement('div');
	boxesContainer.style.display = 'flex';
	boxesContainer.style.flexWrap = 'wrap';
	boxesContainer.style.justifyContent = 'center';
	container.appendChild(boxesContainer);
	let characterBoxes = [];
	let resultsSummary = [];
	selectedCharacters.forEach((actor, index) => {
		const box = createCharacterBox(actor, skillsToRoll, dc, isBlindGM, index, characterBoxes, resultsSummary);
		boxesContainer.appendChild(box);
		characterBoxes.push({box, rolled: false});
	});
	const exitButton = createExitButton();
	container.appendChild(exitButton);
	document.body.appendChild(container);
}

async function addRollButtonEventListener(rollButton, character, skillSelect, box, dc, characterBoxes, resultsSummary) {
	rollButton.addEventListener('click', async () => {
		console.log(`Attempting to find token for actor ${character.name} with UUID ${character.uuid}`);
		const token = canvas.tokens.placeables.find(t => t.actor?.uuid === character.uuid); // Use UUID instead of ID
		if (token) {
			console.log(`Token found for actor ${character.name}:`, token);
			token.control({releaseOthers: true});
		} else {
			console.error(`No active token found for actor ${character.name} with UUID ${character.uuid}`);
			notifyTokenRequired(character.name);
			return;
		}
		const selectedSlug = skillSelect.value;
		const selectedActions = [selectedSlug];
		const selectedActors = [character];
		await executeInstantRoll(selectedActors, selectedActions, dc, true, true, 'publicroll', null, false); // Pass false for fromDialog
	});
}

function addRollBlindButtonEventListener(rollButton, character, skillSelect, box, dc, characterBoxes, resultsSummary) {
	rollButton.addEventListener('click', async () => {
		console.log(`Attempting to find token for actor ${character.name} with UUID ${character.uuid}`);
		const token = canvas.tokens.placeables.find(t => t.actor?.uuid === character.uuid); // Use UUID instead of ID
		if (token) {
			console.log(`Token found for actor ${character.name}:`, token);
			token.control({releaseOthers: true});
		} else {
			console.error(`No active token found for actor ${character.name} with UUID ${character.uuid}`);
			notifyTokenRequired(character.name);
			return;
		}
		const selectedSlug = skillSelect.value;
		const selectedActions = [selectedSlug];
		const selectedActors = [character];
		await executeInstantRoll(selectedActors, selectedActions, dc, true, true, 'blindroll', null, false, {secret: true}); // Pass false for fromDialog and add secret option
	});
}

function fadeOutAndRemoveElement(element, delay) {
	if (element) {
		element.classList.remove('visible');
		element.classList.add('fade-out');
		setTimeout(() => {
			element.remove();
		}, delay);
	}
}

function removeElements() {
	const fadeOutDelay = 500; // Uniform fade-out duration
	// Remove character boxes
	const characterBoxes = document.querySelectorAll('.character-box');
	characterBoxes.forEach(box => fadeOutAndRemoveElement(box, fadeOutDelay));
	// Remove exit button
	const exitButton = document.querySelector('.exit-button');
	if (exitButton) {
		fadeOutAndRemoveElement(exitButton, fadeOutDelay);
	}
	// Remove dark overlay
	const darkOverlay = document.getElementById('dark-overlay');
	fadeOutAndRemoveElement(darkOverlay, fadeOutDelay);
	// Remove roll text heading
	const heading = document.querySelector('#character-box-container h1');
	fadeOutAndRemoveElement(heading, fadeOutDelay);
	// Apply fade-out class to the character box container
	const container = document.getElementById('character-box-container');
	if (container) {
		container.classList.add('fade-out');
		setTimeout(() => {
			container.remove();
		}, fadeOutDelay);
	}
}

function createExitButton() {
	const exitButton = document.createElement('button');
	exitButton.textContent = 'Exit';
	exitButton.className = 'exit-button';
	exitButton.style.display = 'block';
	exitButton.style.width = '90px';
	exitButton.style.margin = '20px auto';
	exitButton.style.zIndex = '9999';
	exitButton.addEventListener('click', async () => {
		setTimeout(() => {
			removeElements();
			sendResultsToGM();
		}, 100);
	});
	return exitButton;
}

function formatSkillOrSaveKey(skillOrSaveKey) {
	const parts = skillOrSaveKey.split(':');
	const formattedParts = parts.map(part => toTitleCase(part.replace(/-/g, ' ')));
	return formattedParts.join(':');
}

function sendResultsToGM() {
	const gmUser = game.users.find(user => user.isGM);
	// Check if the current user is a GM
	if (game.user.isGM) {
		let resultSummaries = [];
		const characterBoxes = document.querySelectorAll('.character-box');
		characterBoxes.forEach(characterBox => {
			const characterName = characterBox.querySelector('h2').textContent;
			const skillOrSaveKey = characterBox.querySelector('select').value;
			const indicatorText = characterBox.querySelector('.indicator-area').textContent.trim();
			resultSummaries.push(`${characterName} - ${formatSkillOrSaveKey(skillOrSaveKey)}: ${indicatorText}`);
		});
		const summaryText = resultSummaries.join("<br>");
		ChatMessage.create({user: game.user._id, content: summaryText, whisper: [gmUser._id]});
	}
}

function createOverlay() {
	const overlay = document.createElement('div');
	overlay.id = 'dark-overlay';
	overlay.classList.add('non-interactive-overlay');
	overlay.style.position = 'fixed';
	overlay.style.top = '0';
	overlay.style.left = '0';
	overlay.style.width = '100%';
	overlay.style.height = '100%';
	overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
	overlay.style.zIndex = '29';
	document.body.appendChild(overlay);
	setTimeout(() => {
		overlay.classList.add('visible');
	}, 50);
	return overlay;
}

function createContainer() {
	const container = document.createElement('div');
	container.id = 'character-box-container';
	container.classList.add('interactive-overlay');
	container.style.position = 'fixed';
	container.style.top = '50%';
	container.style.left = '50%';
	container.style.transform = 'translate(-50%, -50%)';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.alignItems = 'center';
	container.style.zIndex = '99';
	return container;
}


async function createHeadingWithDC(skillsToRoll, dc, isBlindGM) {
	// Helper function to convert a string to title case

	let formattedSkills;
	if (skillsToRoll.length === 1) {
		formattedSkills = toTitleCase(skillsToRoll[0].replace(/-/g, ' '));
	} else if (skillsToRoll.length === 2) {
		formattedSkills = `${toTitleCase(skillsToRoll[0].replace(/-/g, ' '))} or ${toTitleCase(skillsToRoll[1].replace(/-/g, ' '))}`;
	} else if (skillsToRoll.length === 3) {
		formattedSkills = `${toTitleCase(skillsToRoll[0].replace(/-/g, ' '))}, ${toTitleCase(skillsToRoll[1].replace(/-/g, ' '))} or ${toTitleCase(skillsToRoll[2].replace(/-/g, ' '))}`;
	} else {
		formattedSkills = skillsToRoll.map(skill => toTitleCase(skill.replace(/-/g, ' '))).join(', ');
	}


	const showDCForRoll = await game.settings.get('pf2e-roll-manager', 'showDCForRoll') && !isBlindGM;
	const heading = document.createElement('h1');
	heading.textContent = showDCForRoll ? `The GM would like you to attempt a roll: ${formattedSkills} - DC: ${dc}` : `The GM would like you to attempt a roll: ${formattedSkills}`;
	heading.style.color = 'white';
	heading.style.fontFamily = 'Arial, sans-serif';
	heading.style.fontSize = '2em';
	heading.style.marginBottom = '20px';
	return heading;
}

async function createHeadingWrapper(skillsToRoll, dc, isBlindGM) {
	return await createHeadingWithDC(skillsToRoll, dc, isBlindGM);
}

class ResultsManager {
	constructor() {
		this.results = [];
	}

	addResult(result) {
		this.results.push(result);
	}

	clearResults() {
		this.results = [];
	}

	getResultsSummary() {
		return this.results.map(result => {
			return `${result.character}: ${result.skill} - ${result.outcome}`;
		}).join('\n\n'); // Separate each result with two newline characters for clearer separation
	}
}

const resultsManager = new ResultsManager();
