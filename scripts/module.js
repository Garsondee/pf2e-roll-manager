let gmUserIds = [];
let skillDCs = {}; // Format: { 'actorId:skillSlug': DC }
const MODULE_NAMESPACE = "pf2e-roll-manager";
let socketInstance;
const actionsList = ["encouragingWords", "raiseAShield", "restForTheNight", "earnIncome", "steelYourResolve", "takeABreather", "treatWounds", "escape", "seek", "senseMotive", "arcaneSlam", "tamper", "avoidNotice", "senseDirection", "track", "balance", "maneuverInFlight", "squeeze", "tumbleThrough", "climb", "disarm", "forceOpen", "grapple", "highJump", "longJump", "reposition", "shove", "swim", "trip", "whirlingThrow", "craft", "repair", "createADiversion", "feint", "impersonate", "lie", "bonMot", "gatherInformation", "makeAnImpression", "request", "decipherWriting", "subsist", "coerce", "demoralize", "administerFirstAid", "treatDisease", "treatPoison", "commandAnAnimal", "perform", "createForgery", "concealAnObject", "hide", "sneak", "palmAnObject", "disableDevice", "pickALock", "steal"];

let totalCharacterBoxes = 0;
let rolledCharacterBoxes = new Set();
let autoCloseTimeout = null;

// Mapping of action slugs to their associated statistics
const actionToStatMap = {
    'encouragingWords': 'charisma',
    'raiseAShield': 'strength',
    'restForTheNight': null, // Actions without a specific statistic
    'earnIncome': 'charisma',
    'steelYourResolve': 'constitution',
    'takeABreather': 'constitution',
    'treatWounds': 'medicine',
    'escape': 'dexterity',
    'seek': 'perception',
    'senseMotive': 'perception',
    'arcaneSlam': 'intelligence',
    'tamper': 'dexterity',
    'avoidNotice': 'stealth',
    'senseDirection': 'perception',
    'track': 'perception',
    'balance': 'athletics',
    'maneuverInFlight': 'dexterity',
    'squeeze': 'strength',
    'tumbleThrough': 'acrobatics',
    'climb': 'athletics',
    'disarm': 'dexterity',
    'forceOpen': 'strength',
    'grapple': 'strength',
    'highJump': 'athletics',
    'longJump': 'athletics',
    'reposition': 'dexterity',
    'shove': 'strength',
    'swim': 'athletics',
    'trip': 'dexterity',
    'whirlingThrow': 'dexterity',
    'craft': 'crafting',
    'repair': 'crafting',
    'createADiversion': 'deception',
    'feint': 'deception',
    'impersonate': 'deception',
    'lie': 'deception',
    'bonMot': 'deception',
    'gatherInformation': 'society',
    'makeAnImpression': 'deception',
    'request': 'diplomacy',
    'decipherWriting': 'lore',
    'subsist': 'survival',
    'coerce': 'intimidation',
    'demoralize': 'intimidation',
    'administerFirstAid': 'medicine',
    'treatDisease': 'medicine',
    'treatPoison': 'medicine',
    'commandAnAnimal': 'nature',
    'perform': 'performance',
    'createForgery': 'crafting',
    'concealAnObject': 'stealth',
    'hide': 'stealth',
    'sneak': 'stealth',
    'palmAnObject': 'dexterity',
    'disableDevice': 'thievery',
    'pickALock': 'thievery',
    'steal': 'thievery'
};

/**
 * Maps outcome strings to numeric degrees of success.
 *
 * @param {string} outcome - The outcome string from the chat message. Expected values: 'criticalsuccess', 'success', 'failure', 'criticalfailure'.
 * @returns {number | 'unknown'} - The numeric degree of success: 3 (critical success), 2 (success), 1 (failure), 0 (critical failure), or 'unknown' if the outcome is unrecognized.
 */
function mapOutcomeToDegree(outcome) {
    const mapping = {
        'criticalsuccess': 3, 'success': 2, 'failure': 1, 'criticalfailure': 0
    };
    return mapping[outcome.toLowerCase()] ?? 'unknown';
}

/**
 * Extracts relevant roll data from a chat message and processes it.
 *
 * @param {ChatMessage} message - The chat message object containing roll information.
 * @returns {void}
 */
function extractRollData(message) {
    try {
        // Initialize variables
        let degreeOfSuccess, outcome, diceResults, totalModifier, totalResult, rollFormula, dc, actorId, actionName,
            isBlindRoll, rollMode; // Declare rollMode here

        // Set default rollMode
        rollMode = message.rollMode || message.flags?.core?.rollMode || 'publicroll';
        isBlindRoll = (rollMode === 'blindroll');

        // Check if message.rolls exists and has at least one Roll instance
        if (message.rolls && message.rolls.length > 0 && message.rolls[0] instanceof Roll) {
            const roll = message.rolls[0]; // Access the first Roll object

            // Extract necessary fields
            outcome = message.flags.pf2e.context.outcome ?? 'unknown';
            degreeOfSuccess = mapOutcomeToDegree(outcome); // Map the outcome string to a numeric degree

            // Extract dice results
            diceResults = [];
            roll.terms.forEach(term => {
                if (term instanceof Die) {
                    term.results.forEach(result => {
                        diceResults.push(result.result);
                    });
                }
            });

            totalResult = roll.total ?? 0;
            rollFormula = roll.formula ?? '1d20';

            // Calculate totalModifier
            // For PF2e, modifiers are stored in message flags
            const modifiers = message.flags.pf2e.modifiers || [];
            totalModifier = modifiers.reduce((sum, mod) => sum + mod.modifier, 0);

            dc = message.flags?.pf2e?.context?.dc?.value ?? 15; // Default DC to 15 if not specified

        } else {
            console.warn('extractRollData: No valid Roll object found in message.rolls.');
            return;
        }

        // Extract actor information
        actorId = message.speaker?.actor ?? 'unknown';

        // Sanitize actionName by parsing the title HTML
        const rawActionTitle = message.flags?.pf2e?.context?.title;
        actionName = extractActionNameFromFlavor(rawActionTitle) || extractActionNameFromFlavor(message.flavor) || 'unknown-action';

        // Log the extracted information for debugging
        console.log(`[${MODULE_NAMESPACE}] Action: ${actionName}`);
        console.log(`[${MODULE_NAMESPACE}] Actor ID: ${actorId}`);
        console.log(`[${MODULE_NAMESPACE}] Degree of Success: ${degreeOfSuccess}`);
        console.log(`[${MODULE_NAMESPACE}] Outcome: ${outcome}`);
        console.log(`[${MODULE_NAMESPACE}] Dice Results: ${diceResults.join(', ')}`);
        console.log(`[${MODULE_NAMESPACE}] Total Modifier: ${totalModifier}`);
        console.log(`[${MODULE_NAMESPACE}] Total Result: ${totalResult}`);
        console.log(`[${MODULE_NAMESPACE}] DC: ${dc}`);
        console.log(`[${MODULE_NAMESPACE}] Roll Formula: ${rollFormula}`);
        console.log(`[${MODULE_NAMESPACE}] Roll Mode: ${rollMode} (${isBlindRoll ? 'Blind Roll' : 'Public Roll'})`);

        // Handle the extracted data
        handleExtractRollData({ // Corrected function name
            actorId,
            actionName,
            degreeOfSuccess,
            outcome,
            diceResults,
            totalModifier,
            totalResult,
            dc,
            rollFormula,
            isBlindRoll
        });
    } catch (error) {
        console.error(`[${MODULE_NAMESPACE}] Error extracting roll data from chat message:`, error);
    }
}

/**
 * Handles the extracted roll data by emitting socket events and updating the UI.
 *
 * @param {Object} rollData - The extracted roll data.
 * @param {string} rollData.actorId - The ID of the actor who performed the roll.
 * @param {string} rollData.actionName - The name of the action rolled.
 * @param {number} rollData.degreeOfSuccess - Numeric degree of success (0-3).
 * @param {string} rollData.outcome - The outcome string ('success', etc.).
 * @param {Array<number>} rollData.diceResults - The individual dice results.
 * @param {number} rollData.totalModifier - The total modifier applied to the roll.
 * @param {number} rollData.totalResult - The total result of the roll (dice + modifiers).
 * @param {number} rollData.dc - The Difficulty Class (DC) of the roll.
 * @param {string} rollData.rollFormula - The formula used for the roll.
 * @param {boolean} rollData.isBlindRoll - Indicates if the roll was made as a blind roll.
 * @returns {void}
 */
function handleExtractRollData(rollData) {
    const {
        actorId,
        actionName,
        degreeOfSuccess,
        outcome,
        diceResults,
        totalModifier,
        totalResult,
        dc,
        rollFormula,
        isBlindRoll
    } = rollData;

    // Construct the result object as expected by updateRollResultInCharacterBox
    const result = {degreeOfSuccess, total: totalResult};

    // Map actionName to skillOrSaveKey using the actionToStatMap
    let skillOrSaveKey;
    if (actionName === 'perception') {
        skillOrSaveKey = `perception:${actionName}`;
    } else if (actionToStatMap[actionName]) {
        // If the action has an associated statistic, include it in the full-slug
        const associatedStat = actionToStatMap[actionName];
        skillOrSaveKey = `action:${actionName}:${associatedStat}`;
    } else {
        // For actions without an associated statistic
        skillOrSaveKey = `action:${actionName}`;
    }

    // Prepare socket data with the correct structure
    const socketData = {actorId, skillOrSaveKey, result, isBlindRoll};

    console.log("handleExtractRollData: Emitting socket event with data:", socketData);

    if (isBlindRoll) {
        // Handle blind rolls if necessary
        const gmUserIds = game.users.filter(u => u.isGM).map(u => u.id);
        socketInstance.executeForUsers("updateRollResultUI", gmUserIds, socketData);
        const playerSocketData = {actorId, isBlindRoll}; // No result data
        socketInstance.executeForOthers("updateRollResultUI", playerSocketData);
    } else {
        // For public rolls, send data to everyone
        socketInstance.executeForEveryone("updateRollResultUI", socketData);
    }

    // Optionally, update the character box UI for the GM directly
    if (game.user.isGM) {
        updateRollResultInCharacterBox(socketData);
    }
}

/**
 * Registers all necessary socket event listeners for the PF2E Roll Manager module.
 *
 * @param {socketlib.Socket} socket - The registered socket instance.
 */
function registerSocketListeners(socket) {
    console.log(`[${MODULE_NAMESPACE}] Registering socket event listeners...`);

    // Listener for generating character roll boxes
    socket.register("generateCharacterRollBoxes", async (data) => {
        console.log(`[${MODULE_NAMESPACE}] Received 'generateCharacterRollBoxes' event with data:`, data);
        try {
            const {selectedCharacters, skillsToRoll, dc, isBlindGM, skillDCs} = data;
            const actors = selectedCharacters.map((id) => game.actors.get(id)).filter(actor => actor !== null && actor.isOwner);
            if (actors.length > 0) {
                if (!game.user.isGM) {
                    // Only non-GMs generate boxes
                    await generateCharacterRollBoxes(actors, skillsToRoll, dc, isBlindGM, skillDCs, true);
                    console.log(`[${MODULE_NAMESPACE}] 'generateCharacterRollBoxes' processed successfully.`);
                } else {
                    console.log(`[${MODULE_NAMESPACE}] Skipping 'generateCharacterRollBoxes' for GM.`);
                }
            } else {
                console.warn(`[${MODULE_NAMESPACE}] No valid actors found in 'generateCharacterRollBoxes' event.`);
            }
        } catch (error) {
            console.error(`[${MODULE_NAMESPACE}] Error handling 'generateCharacterRollBoxes' event:`, error);
        }
    });

    // Listener for updating roll results UI
    socket.register("updateRollResultUI", (data) => {
        console.log(`[${MODULE_NAMESPACE}] Received 'updateRollResultUI' event with data:`, data);
        updateRollResultInCharacterBox(data);
    });

    // Listener for updating DC inputs
    socket.register("updateDCInput", (data) => {
        console.log(`[${MODULE_NAMESPACE}] Received 'updateDCInput' event with data:`, data);
        const {actorId, skillSlug, newDC} = data;
        if (!actorId || !skillSlug || typeof newDC !== 'number') {
            console.warn(`[${MODULE_NAMESPACE}] 'updateDCInput' event received with invalid data:`, data);
            return;
        }
        // Update the DC input box if it exists
        const dcInput = document.querySelector(`.skill-dc-input[data-slug="${skillSlug}"][data-actor-id="${actorId}"]`);
        if (dcInput) {
            dcInput.value = newDC;
            console.log(`[${MODULE_NAMESPACE}] Updated DC input for actor ${actorId}, skill ${skillSlug} to ${newDC}`);
        } else {
            console.warn(`[${MODULE_NAMESPACE}] DC input not found for actor ${actorId}, skill ${skillSlug}.`);
        }
    });

    // Test listener to confirm socket communication
    socket.register("test", (data) => {
        console.log(`[${MODULE_NAMESPACE}] Received 'test' event with data:`, data);
    });

    // **New Listener for Auto-Close Roll Interface**
    socket.register("autoCloseRollInterface", () => {
        console.log(`[${MODULE_NAMESPACE}] Received 'autoCloseRollInterface' event. Closing the interface.`);
        removeElements();
    });

    console.log(`[${MODULE_NAMESPACE}] All socket event listeners registered successfully.`);
}

/**
 * Selects and highlights the tokens on the canvas that correspond to the provided actors.
 *
 * @param {Actor[]} actors - Array of Actor objects to select tokens for.
 * @returns {void}
 */
function selectTokensForActors(actors) {
    // Find tokens on the canvas that correspond to the provided actors
    const tokensToSelect = canvas.tokens.placeables.filter(token => {
        const actor = token.actor;
        return actor && actors.some(a => a.id === actor.id);
    });

    if (tokensToSelect.length === 0) {
        ui.notifications.warn("No tokens found for the selected actors.");
        return;
    }

    // Release all currently controlled tokens
    canvas.tokens.releaseAll();

    // Control the desired tokens without releasing others (since we've already released them)
    tokensToSelect.forEach(token => token.control({
        releaseOthers: false
    }));

    console.log(`Selected ${tokensToSelect.length} token(s) for actors:`, actors.map(a => a.name));
}

/**
 * Handles the click event for action buttons, opening the Roll Manager dialog
 * with the specified action preselected and the DC set.
 *
 * @param {string} action - The slug of the action to preselect (e.g., 'seek').
 * @param {number} dc - The Difficulty Class to set for the roll.
 * @param {string} traits - Any additional traits associated with the action.
 * @returns {void}
 */
function handleActionButtonClick(action, dc, traits) {
    if (typeof action !== 'string' || action.trim() === "") {
        console.error('handleActionButtonClick: Invalid action provided.', {
            action, dc
        });
        ui.notifications.error("An invalid action was selected. Please try again.");
        return;
    }

    console.log(`Action: ${action}, DC: ${dc}, Traits: ${traits}`);

    let preSelectedActions;
    let skillDCs = {};

    // Determine the associated statistic for the action
    const associatedStat = actionToStatMap[action.toLowerCase()] || null;
    if (associatedStat) {
        preSelectedActions = [`action:${action.toLowerCase()}:${associatedStat}`];
        skillDCs[`action:${action.toLowerCase()}:${associatedStat}`] = dc;
        console.log(`handleActionButtonClick: Preselecting "${action}:${associatedStat}" with DC: ${dc}`);
    } else if (action.toLowerCase() === 'perception') {
        // Handle perception as a special case if needed
        preSelectedActions = [`perception:${action.toLowerCase()}`];
        skillDCs[`perception:${action.toLowerCase()}`] = dc;
        console.log(`handleActionButtonClick: Preselecting "${action}:perception" with DC: ${dc}`);
    } else {
        preSelectedActions = [`action:${action.toLowerCase()}`];
        skillDCs[`action:${action.toLowerCase()}`] = dc;
        console.log(`handleActionButtonClick: Preselecting "${action}" with DC: ${dc}`);
    }

    // Call createActionDropdown with preSelectedActions and skillDCs
    createActionDropdown({
        defaultDC: dc,
        preSelectedActions: preSelectedActions,
        gameSystem: game.pf2e,
        defaultRollMode: "publicroll",
        defaultCreateMessage: true,
        defaultSkipDialog: false,
        skillDCs: skillDCs, // Mapping full-slug to DC
    });
}

function formatSkillName(skillName) {
    // Assuming skillName is in the format "skill:variant" or just "skill"
    const parts = skillName.split(':');
    const baseSkill = parts[0];
    const variant = parts[1] ? ` (${parts[1]})` : '';

    // Convert the base skill to title case
    const formattedBaseSkill = baseSkill.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

    return formattedBaseSkill + variant;
}

/**
 * Creates a select element populated with skills/actions.
 *
 * @param {Object} actor - The actor for whom the skills are being selected.
 * @param {Array} skillsToRoll - An array of skill/action slugs with prefixes.
 * @param {Object} skills - The actor's skills.
 * @param {Object} saves - The actor's saves.
 * @param {Object} otherAttributes - Other attributes like perception.
 * @returns {HTMLElement} - The populated select element.
 */
function createSkillSelect(actor, skillsToRoll, skills, saves, otherAttributes) {
    console.log(`Creating skill select for actor: ${actor.name}, skillsToRoll: ${skillsToRoll}`);
    const skillSelect = document.createElement('select');
    skillSelect.className = 'skill-select';
    skillSelect.style.marginTop = '10px';
    skillSelect.style.width = '200px';

    // Check if skillsToRoll is not empty
    if (skillsToRoll.length === 0) {
        const noOptions = document.createElement('option');
        noOptions.value = '';
        noOptions.textContent = '-- No Skills/Actions Available --';
        noOptions.disabled = true;
        noOptions.selected = true;
        skillSelect.appendChild(noOptions);
        console.warn('createSkillSelect: No skills/actions available to populate the select element.');
        return skillSelect;
    }

    // Iterate over skillsToRoll and create option elements
    skillsToRoll.forEach((skillName, index) => {
        if (skillName) {
            const parts = skillName.split(':');
            const prefix = parts[0].toLowerCase();
            let slug = parts[1] ? parts[1].toLowerCase() : '';

            // For 'perception', handle accordingly
            if (!slug && prefix === 'perception') {
                slug = 'perception';
            }

            let option = document.createElement('option');
            let skillModifier = 0;

            if (prefix === 'skill') {
                skillModifier = getModifierForStatistic(actor, slug, skills, saves, otherAttributes);
                option.value = `${prefix}:${slug}`;
                option.textContent = `${toTitleCase(formatSkillName(slug.replace(/-/g, ' ')))} (${skillModifier >= 0 ? '+' : ''}${skillModifier})`;
            } else if (prefix === 'action') {
                const actionSlug = slug;
                let statisticToUse = parts[2] ? parts[2].toLowerCase() : null;

                if (!statisticToUse) {
                    console.warn(`createSkillSelect: No statistic found for action "${actionSlug}". Skipping.`);
                    return; // Skip this action
                }

                skillModifier = getModifierForStatistic(actor, statisticToUse, skills, saves, otherAttributes);

                option.value = `${prefix}:${actionSlug}:${statisticToUse}`;
                option.textContent = `${toTitleCase(formatSkillName(actionSlug.replace(/-/g, ' ')))} (${toTitleCase(statisticToUse.replace(/-/g, ' '))}) (${skillModifier >= 0 ? '+' : ''}${skillModifier})`;
            } else if (prefix === 'perception') {
                skillModifier = getModifierForStatistic(actor, slug, skills, saves, otherAttributes);
                option.value = `${prefix}:${slug}`;
                option.textContent = `${toTitleCase(formatSkillName(slug.replace(/-/g, ' ')))} (${skillModifier >= 0 ? '+' : ''}${skillModifier})`;
            } else if (prefix === 'save') {
                skillModifier = getModifierForStatistic(actor, slug, skills, saves, otherAttributes);
                option.value = `${prefix}:${slug}`;
                option.textContent = `${toTitleCase(formatSkillName(slug.replace(/-/g, ' ')))} (${skillModifier >= 0 ? '+' : ''}${skillModifier})`;
            } else {
                console.warn(`createSkillSelect: Unrecognized prefix "${prefix}" for skill "${skillName}".`);
                return; // Skip unrecognized categories
            }

            // Set the first option as selected by default
            if (index === 0) {
                option.selected = true;
                console.log(`createSkillSelect: Setting "${option.textContent}" as the default selected option.`);
            }

            skillSelect.appendChild(option);
        }
    });

    return skillSelect;
}

function getSkills(actor) {
    // console.log('PF2E Roll Manager: Actor Skills Data:', actor.system.skills); // Log the skills object within actor.system
    const skills = actor.system?.skills || {}; // Using optional chaining to access system.skills
    const skillData = {};
    for (const [key, value] of Object.entries(skills)) {
        skillData[key] = value.totalModifier ?? 0; // Directly accessing totalModifier
    }
    return skillData;
}

function getSaves(actor) {
    // console.log('PF2E Roll Manager: Actor Saves Data:', actor.system.saves); // Log the saves object within actor.system
    const saves = actor.system?.saves || {}; // Using optional chaining to access system.saves
    const saveData = {};
    for (const [key, value] of Object.entries(saves)) {
        saveData[key] = value.totalModifier ?? 0; // Directly accessing totalModifier
    }
    return saveData;
}

function getOtherAttributes(actor) {
    const perception = actor.system.perception?.totalModifier ?? 0;
    return {
        perception: perception
    };
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

let selectedCharacterIds = new Set();

/**
 * Attaches click event listeners to character selection buttons within the specified container.
 *
 * @param {HTMLElement} container - The container element holding character selection buttons.
 * @returns {void}
 */
function attachCharacterSelectionListeners(container) {
    console.log("attachCharacterSelectionListeners: Initializing listeners for character selection.");

    // Ensure the container is valid
    if (!container) {
        console.error("attachCharacterSelectionListeners: Invalid container provided.");
        return;
    }

    // Load persisted selections
    const persistedSelections = game.settings.get("pf2e-roll-manager", "persistedSelectedCharacters") || [];
    console.log("attachCharacterSelectionListeners: Loaded persisted selections:", persistedSelections);

    // Select all character selection buttons within the container
    const characterButtons = container.querySelectorAll('.character-select-button');
    console.log(`attachCharacterSelectionListeners: Found ${characterButtons.length} character selection buttons.`);

    // Iterate over each button and attach a click event listener
    characterButtons.forEach((button, index) => {
        console.log(`attachCharacterSelectionListeners: Attaching listener to button ${index + 1}:`, button);

        const actorId = button.dataset.actorId;

        // If this actor is in the persisted selection, select it
        if (persistedSelections.includes(actorId)) {
            selectedCharacterIds.add(actorId);
            button.classList.add('selected');
            console.log(`attachCharacterSelectionListeners: Auto-selecting actor ID: ${actorId}`);
        }

        button.addEventListener('click', (event) => {
            console.log(`Character Selection Listener: Button ${index + 1} clicked.`);

            // Retrieve the button that was clicked
            const clickedButton = event.currentTarget;
            const actorId = clickedButton.dataset.actorId;

            // Validate the actor ID
            if (!actorId) {
                console.warn("Character Selection Listener: Clicked button does not have a valid actor ID.");
                return;
            }

            console.log(`Character Selection Listener: Actor ID retrieved: ${actorId}`);

            // Check if the actor is already selected
            if (selectedCharacterIds.has(actorId)) {
                // Deselect the actor
                selectedCharacterIds.delete(actorId);
                clickedButton.classList.remove('selected');
                console.log(`Character Selection Listener: Deselecting actor ID: ${actorId}`);
            } else {
                // Select the actor
                selectedCharacterIds.add(actorId);
                clickedButton.classList.add('selected');
                console.log(`Character Selection Listener: Selecting actor ID: ${actorId}`);
            }

            // Log the current state of selected characters
            console.log("Character Selection Listener: Current selectedCharacterIds:", Array.from(selectedCharacterIds));

            // Save the updated selections to the world setting
            savePersistedSelections();
        });
    });

    // Log completion of listener attachment
    console.log("attachCharacterSelectionListeners: All listeners attached successfully.");
}

/**
 * Saves the currently selected character IDs to the persistent world settings.
 *
 * @returns {Promise<void>}
 */
function savePersistedSelections() {
    if (!game.user.isGM) return;
    const selectedIdsArray = Array.from(selectedCharacterIds);
    game.settings.set("pf2e-roll-manager", "persistedSelectedCharacters", selectedIdsArray)
        .then(() => {
            console.log(`[${MODULE_NAMESPACE}] Persisted selected characters saved:`, selectedIdsArray);
        })
        .catch(err => {
            console.error(`[${MODULE_NAMESPACE}] Failed to save persisted selected characters:`, err);
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
        const actorId = button.dataset.actorId;
        if (selectedCharacterIds.has(actorId)) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });
}

function buildCharacterVisibilityDialog() {
    const playerCharacters = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
    const hiddenCharacters = JSON.parse(localStorage.getItem('hiddenCharacters')) || [];

    const content = `
    <form>
      ${playerCharacters.map(actor => {
        const isChecked = hiddenCharacters.includes(actor.id) ? 'checked' : '';
        return `
          <div class="character-visibility-item">
            <input type="checkbox" id="visibility-${actor.id}" data-actor-id="${actor.id}" ${isChecked} />
            <label for="visibility-${actor.id}">${actor.name}</label>
          </div>
        `;
    }).join('\n')}
    </form>
  `;

    const dialog = new Dialog({
        title: "Select which characters to hide. Reload Roll Manager After.", content: content, buttons: {
            save: {
                label: "Save", callback: (html) => {
                    const hiddenCharacters = Array.from(html.find('input[type="checkbox"]:checked')).map(el => el.dataset.actorId);
                    localStorage.setItem('hiddenCharacters', JSON.stringify(hiddenCharacters));
                    updateCharacterSelectionGrid();
                }
            }, cancel: {
                label: "Cancel"
            }
        }, default: "save", render: (html) => {
            // Additional rendering logic if needed
        }, close: () => {
            // Additional close logic if needed
        }
    });

    dialog.render(true);
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

/**
 * Handles the callback when the 'Roll' button is clicked in the action dropdown dialog.
 *
 * @param {jQuery} html - The jQuery object representing the rendered dialog HTML.
 * @param {number} defaultDC - The default Difficulty Class (DC) to use if not specified.
 * @returns {Promise<void>}
 */
function handleRollCallback(html, defaultDC) {
    console.log(`[${MODULE_NAMESPACE}] handleRollCallback: 'Roll' button clicked.`);

    let selectedSkills = Array.from(html.find('.skill-button.selected'))
        .map(el => el.dataset.fullSlug)
        .filter(fullSlug => typeof fullSlug === 'string' && fullSlug.trim() !== "")
        .filter(fullSlug => fullSlug.includes(':')); // Ensure prefix is present

    console.log(`[${MODULE_NAMESPACE}] handleRollCallback: Selected Skills (fullSlugs):`, selectedSkills);

    let skillDCs = {};
    selectedSkills.forEach(fullSlug => {
        const dcInput = html.find(`.skill-dc-input[data-full-slug="${fullSlug}"]`);
        const dc = parseInt(dcInput.val(), 10) || defaultDC;
        skillDCs[fullSlug] = dc;
        console.log(`[${MODULE_NAMESPACE}] handleRollCallback: Set DC for "${fullSlug}": ${dc}`);
    });

    if (!selectedSkills.length) {
        ui.notifications.warn("No actions selected.");
        console.warn("handleRollCallback: No actions selected.");
        return;
    }
    if (!selectedCharacterIds.size) { // Ensure selectedCharacterIds is defined globally or passed appropriately
        ui.notifications.warn("No characters selected.");
        console.warn("handleRollCallback: No characters selected.");
        return;
    }

    let selectedActors = Array.from(selectedCharacterIds).map((id) => {
        console.log(`handleRollCallback: Fetching actor for ID: ${id}`);
        let actor = game.actors.get(id);
        if (!actor) {
            console.warn(`handleRollCallback: Actor not found for ID: ${id}.`);
        } else {
            console.log(`handleRollCallback: Fetched actor: "${actor.name}" (ID: ${id})`);
        }
        return actor;
    }).filter(actor => actor !== undefined);
    console.log("handleRollCallback: Selected Actors:", selectedActors);

    let isBlindGM = false; // Define isBlindGM as needed

    // Emit socket event with correctly structured data
    const socketData = {
        type: 'generateCharacterRollBoxes',
        selectedCharacters: selectedActors.map(actor => actor.id),
        skillsToRoll: selectedSkills,
        dc: defaultDC,
        isBlindGM: isBlindGM,
        skillDCs: skillDCs
    };
    console.log("handleRollCallback: Emitting socket event with data:", socketData);
    socketInstance.executeForEveryone("generateCharacterRollBoxes", socketData);

    // Call generateCharacterRollBoxes directly for the GM
    generateCharacterRollBoxes(selectedActors, selectedSkills, defaultDC, isBlindGM, skillDCs, false); // fromSocket is false when called directly

    // Clear current selections
    selectedCharacterIds.clear();
    savePersistedSelections(); // Update the persisted selections
    updateCharacterSelectionGrid(); // Update the UI to reflect cleared selections
}

/**
 * Handles the callback when the 'Instant Roll' button is clicked in the action dropdown dialog.
 *
 * @param {jQuery} html - The jQuery object representing the rendered dialog HTML.
 * @param {number} defaultDC - The default Difficulty Class (DC) to use if not specified.
 * @returns {Promise<void>}
 */
async function handleInstantRollCallback(html, defaultDC) {
    console.log("handleInstantRollCallback: 'Instant Roll' button clicked.");
    let selectedSkills = Array.from(html.find('.skill-button.selected'))
        .map(el => el.dataset.fullSlug) // Use fullSlug to maintain consistency
        .filter(fullSlug => typeof fullSlug === 'string' && fullSlug.trim() !== "");
    console.log("handleInstantRollCallback: Selected Skills (fullSlugs):", selectedSkills);

    let selectedCharacterIdsArray = Array.from(html.find('.character-select-button.selected'))
        .map(el => el.dataset.actorId);
    console.log("handleInstantRollCallback: Selected Character UUIDs Array:", selectedCharacterIdsArray);

    let skillDCs = {};
    selectedSkills.forEach(fullSlug => {
        const slug = fullSlug.split(':')[1]; // Get the slug part
        const dcInput = html.find(`.skill-dc-input[data-slug="${slug}"]`);
        const dc = parseInt(dcInput.val()) || defaultDC;
        skillDCs[fullSlug] = dc;
        console.log(`handleInstantRollCallback: Set DC for "${fullSlug}": ${dc}`);
    });

    if (!selectedSkills.length) {
        ui.notifications.warn("No actions selected.");
        console.warn("handleInstantRollCallback: No actions selected.");
        return;
    }
    if (!selectedCharacterIdsArray.length) {
        ui.notifications.warn("No characters selected.");
        console.warn("handleInstantRollCallback: No characters selected.");
        return;
    }

    let selectedActors = selectedCharacterIdsArray.map((id) => {
        console.log(`handleInstantRollCallback: Fetching actor for ID: ${id}`);
        let actor = game.actors.get(id);
        if (!actor) {
            console.warn(`handleInstantRollCallback: Actor not found for ID: ${id}`);
        } else {
            console.log(`handleInstantRollCallback: Fetched actor: "${actor.name}" (ID: ${id})`);
        }
        return actor;
    }).filter(actor => actor !== undefined);

    selectedActors = selectedActors.filter(actor => actor !== undefined);
    console.log("handleInstantRollCallback: Selected Actors:", selectedActors);


    // Execute the instant roll with skillDCs and secret option
    console.log("handleInstantRollCallback: Executing instant roll...");
    await executeInstantRoll(selectedActors, selectedSkills, defaultDC, true, // createMessage
        undefined, // skipDialog (removed forcing)
        'blindroll', // rollMode
        null, // selectedStatistic
        false, // fromDialog
        {
            secret: true, skillDCs
        } // additionalOptions with prefixed slug and secret
    );
}

/**
 * Handles the callback when the 'Blind GM Roll' button is clicked in the action dropdown dialog.
 *
 * @param {jQuery} html - The jQuery object representing the rendered dialog HTML.
 * @param {number} defaultDC - The default Difficulty Class (DC) to use if not specified.
 * @returns {Promise<void>}
 */
async function handleBlindGMRollCallback(html, defaultDC) {
    console.log("handleBlindGMRollCallback: 'Blind GM Roll' button clicked.");
    let selectedSkills = Array.from(html.find('.skill-button.selected'))
        .map(el => el.dataset.fullSlug)
        .filter(fullSlug => typeof fullSlug === 'string' && fullSlug.trim() !== "");
    console.log("handleBlindGMRollCallback: Selected Skills (fullSlugs):", selectedSkills);

    let selectedCharacterIdsArray = Array.from(html.find('.character-select-button.selected'))
        .map(el => el.dataset.actorId);
    console.log("handleBlindGMRollCallback: Selected Character UUIDs Array:", selectedCharacterIdsArray);

    let skillDCs = {};
    selectedSkills.forEach(fullSlug => {
        const slug = fullSlug.split(':')[1]; // Get the slug part
        const dcInput = html.find(`.skill-dc-input[data-slug="${slug}"]`);
        const dc = parseInt(dcInput.val()) || defaultDC;
        skillDCs[fullSlug] = dc;
        console.log(`handleBlindGMRollCallback: Set DC for "${fullSlug}": ${dc}`);
    });

    if (!selectedSkills.length) {
        ui.notifications.warn("No actions selected.");
        console.warn("handleBlindGMRollCallback: No actions selected.");
        return;
    }
    if (!selectedCharacterIdsArray.length) {
        ui.notifications.warn("No characters selected.");
        console.warn("handleBlindGMRollCallback: No characters selected.");
        return;
    }

    let selectedActors = selectedCharacterIdsArray.map((id) => {
        console.log(`handleBlindGMRollCallback: Fetching actor for ID: ${id}`);
        let actor = game.actors.get(id);
        if (!actor) {
            console.warn(`handleBlindGMRollCallback: Actor not found for ID: ${id}`);
        } else {
            console.log(`handleBlindGMRollCallback: Fetched actor: "${actor.name}" (ID: ${id})`);
        }
        return actor;
    }).filter(actor => actor !== undefined);

    console.log("handleBlindGMRollCallback: Selected Actors:", selectedActors);

    // Execute the blind roll with skillDCs and secret option
    console.log("handleBlindGMRollCallback: Executing blind roll...");
    await executeInstantRoll(selectedActors, selectedSkills, defaultDC, true, // createMessage
        undefined, // skipDialog (removed forcing)
        'blindroll', // rollMode
        null, // selectedStatistic
        false, // fromDialog
        true, // secret
        {
            secret: true, skillDCs
        } // additionalOptions with prefixed slug and secret
    );
}

/**
 * Creates and displays the Roll Manager dialog with preselected actions and DCs.
 *
 * @param {Object} options - Configuration options for the dialog.
 * @param {Object} [options.gameSystem=game.pf2e] - The game system (e.g., Pathfinder 2E).
 * @param {number} [options.defaultDC=15] - The default Difficulty Class (DC) for the rolls.
 * @param {string} [options.defaultRollMode="publicroll"] - The default roll mode (e.g., 'publicroll', 'blindroll').
 * @param {boolean} [options.defaultCreateMessage=true] - Whether to create a chat message for the roll.
 * @param {boolean} [options.defaultSkipDialog=false] - Whether to skip confirmation dialogs.
 * @param {Array<string>} [options.excludeActions=[]] - An array of action slugs to exclude from the dialog.
 * @param {Array<string>} [options.preSelectedActions=[]] - An array of action slugs to preselect in the dialog.
 * @param {Object} [options.skillDCs={}] - An object mapping action slugs to their specific DCs.
 * @returns {Promise<void>}
 */
async function createActionDropdown({
    gameSystem = game.pf2e,
    defaultDC = 15,
    defaultRollMode = "publicroll",
    defaultCreateMessage = true,
    defaultSkipDialog = false,
    excludeActions = [],
    preSelectedActions = [],
    skillDCs = {}
} = {}) {
    console.log("createActionDropdown: Initializing with options:", {
        gameSystem,
        defaultDC,
        defaultRollMode,
        defaultCreateMessage,
        defaultSkipDialog,
        excludeActions,
        preSelectedActions,
        skillDCs
    });

    const actions = gameSystem.actions;
    if (!actions) {
        console.error("createActionDropdown: Game system actions not found.");
        return;
    }

    // Determine the default DC based on the level of the selected actors
    const selectedActors = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
    const highestLevel = Math.max(...selectedActors.map(actor => actor.system.details.level.value));
    defaultDC = calculateDefaultDC(highestLevel);
    console.log(`createActionDropdown: Calculated default DC based on highest level (${highestLevel}): ${defaultDC}`);

    // Group actions by their associated statistics
    const groupedActions = groupActionsByStatistic(actions, excludeActions);

    // Define major skills
    const majorSkills = [{name: 'Acrobatics', slug: 'acrobatics'}, {name: 'Arcana', slug: 'arcana'}, {
        name: 'Athletics',
        slug: 'athletics'
    }, {name: 'Crafting', slug: 'crafting'}, {name: 'Deception', slug: 'deception'}, {
        name: 'Diplomacy',
        slug: 'diplomacy'
    }, {name: 'Intimidation', slug: 'intimidation'}, {name: 'Medicine', slug: 'medicine'}, {
        name: 'Nature',
        slug: 'nature'
    }, {name: 'Occultism', slug: 'occultism'}, {name: 'Performance', slug: 'performance'}, {
        name: 'Religion',
        slug: 'religion'
    }, {name: 'Society', slug: 'society'}, {name: 'Stealth', slug: 'stealth'}, {
        name: 'Survival',
        slug: 'survival'
    }, {name: 'Thievery', slug: 'thievery'}];

    // Create HTML for skill buttons
    const majorSkillButtonsHtml = buildSkillButtonsHtml(majorSkills, 'skill:');
    const perceptionButtonHtml = buildSkillButtonsHtml([{name: 'Perception', slug: 'perception'}], 'perception:');
    const savingThrowsButtonsHtml = buildSkillButtonsHtml([{
        name: 'Fortitude Save',
        slug: 'fortitude'
    }, {name: 'Reflex Save', slug: 'reflex'}, {name: 'Will Save', slug: 'will'}], 'save:');

    // Handle recall knowledge skills
    const recallKnowledgeSkills = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character")
        .flatMap(actor => {
            const recallSkills = getRecallKnowledgeSkills(actor); // Assuming this returns an object
            if (!recallSkills) {
                console.warn(`createActionDropdown: getRecallKnowledgeSkills returned undefined for actor "${actor.name}".`);
                return [];
            }
            return Object.keys(recallSkills).map(lore => {
                if (!lore) {
                    console.warn(`createActionDropdown: Encountered empty lore for actor "${actor.name}". Skipping.`);
                    return null;
                }
                const slug = lore.toLowerCase().replace(/\s+/g, '-');
                return {
                    name: lore, slug: slug // Removed 'statistic' property
                };
            }).filter(skill => skill !== null);
        });

    console.log(`createActionDropdown: Compiled Recall Knowledge Skills:`, recallKnowledgeSkills);
    const recallKnowledgeButtonsHtml = buildSkillButtonsHtml(recallKnowledgeSkills, 'skill:'); // Changed prefix to 'skill:'

    // Handle actions grouped by statistics
    const skillButtonsHtml = Object.keys(groupedActions).sort().map(stat => {
        const group = groupedActions[stat];
        console.log(`createActionDropdown: Building skill buttons for category: "${stat}"`, group);
        return `
          <details id="stat-section-${stat}" class="stat-section details-section">
            <summary class="details-summary">${toTitleCase(transformLabel(game.i18n.localize(stat)))}</summary>
            <div class="stat-section-content">
              <div class="skill-buttons-row flex-container">${buildSkillButtonsHtml(group, 'action:')}</div>
            </div>
          </details>
        `;
    }).join('\n');

    console.log("createActionDropdown: Skill Buttons HTML:", skillButtonsHtml);

    // Build character selection HTML
    const characterSelectionHtml = buildCharacterSelectionHtml();
    console.log("createActionDropdown: Character Selection HTML:", characterSelectionHtml);

    // Build dialog content
    const content = buildDialogContent({
        perceptionButtonHtml,
        majorSkillButtonsHtml,
        skillButtonsHtml,
        savingThrowsButtonsHtml,
        recallKnowledgeButtonsHtml,
        characterSelectionHtml
    });

    // Define dialog buttons and their callbacks
    const dialogButtons = {
        roll: {
            label: "Roll", callback: async (html) => {
                await handleRollCallback(html, defaultDC);
            }
        }, instantRoll: {
            label: "Instant Roll", callback: async (html) => {
                await handleInstantRollCallback(html, defaultDC);
            }
        }, blindGM: {
            label: "Blind GM Roll", callback: async (html) => {
                await handleBlindGMRollCallback(html, defaultDC);
            }
        }, cancel: {
            label: "Cancel", callback: () => {
                console.log("Dialog: 'Cancel' button clicked.");
            }
        }
    };

    // Create and configure the dialog
    const dialog = new Dialog({
        title: "PF2E Roll Manager - GM Setup",
        content: content,
        buttons: dialogButtons,
        default: "roll",
        render: (html) => {
            console.log("Dialog: Rendered.");
            restoreCollapsibleState();

            // Attach all event listeners
            attachDialogEventListeners(html);

            // Pre-select actions based on preSelectedActions
            preSelectedActions.forEach(actionSlug => {
                const actionButton = html.find(`.skill-button[data-full-slug="${actionSlug}"]`);
                if (actionButton.length) {
                    actionButton.addClass('selected');
                    // Show and set the associated DC input
                    const dcInput = html.find(`.skill-dc-input[data-full-slug="${actionSlug}"]`);
                    dcInput.show();
                    const actionDC = skillDCs[actionSlug] || defaultDC;
                    dcInput.val(actionDC);
                    console.log(`[${MODULE_NAMESPACE}] Preselecting action "${actionSlug}" with DC: ${actionDC}`);
                } else {
                    console.error(`Action button not found in dialog for action: ${actionSlug}`);
                }
            });
        },
        close: () => {
            console.log("Dialog: Closed.");
            saveCollapsibleState();
        },
        options: {
            width: 600, height: 600, resizable: true
        }
    });

    console.log("createActionDropdown: Creating and rendering the Action Dropdown dialog.");
    dialog.render(true);
}

/**
 * Executes instant rolls for selected actors and actions.
 *
 * @param {Actor[]} selectedActors - The actors to perform the rolls.
 * @param {string[]} selectedActions - The actions or skills to roll, represented as prefixed slugs (e.g., 'skill:acrobatics').
 * @param {number} dc - The default Difficulty Class (DC) for the rolls.
 * @param {boolean} createMessage - Whether to create a chat message for the roll.
 * @param {boolean} [skipDialog=false] - Whether to skip any confirmation dialogs.
 * @param {string} [rollMode="publicroll"] - The mode of the roll (e.g., 'publicroll', 'blindroll').
 * @param {string|null} [selectedStatistic=null] - The selected statistic for the action, if any.
 * @param {boolean} [fromDialog=false] - Indicates if the roll is initiated from a dialog.
 * @param {boolean} [secret=false] - Indicates if the roll should be secret (hidden from players).
 * @param {Object} [additionalOptions={}] - Additional options for the roll.
 * @param {Object} [additionalOptions.skillDCs] - An object mapping 'prefix:slug' to specific DCs.
 * @returns {Promise<void>}
 */
async function executeInstantRoll(selectedActors, selectedActions, dc, createMessage, skipDialog, rollMode, selectedStatistic, fromDialog = false, secret = false, additionalOptions = {}) {
    try {
        console.log(`[${MODULE_NAMESPACE}] Executing instant roll with parameters:`, {
            selectedActors,
            selectedActions,
            dc,
            createMessage,
            skipDialog,
            rollMode,
            selectedStatistic,
            fromDialog,
            secret,
            additionalOptions,
        });

        const isBlindRoll = rollMode === 'blindroll';
        const isSecret = secret || isBlindRoll;

        // Construct roll options
        const rollOptions = {
            createMessage, rollMode, secret: isSecret, dc: dc, // Default DC
            ...additionalOptions,
        };

        // Select the tokens for the selected actors
        selectTokensForActors(selectedActors);

        // Iterate over each selected actor and execute the action
        for (const actor of selectedActors) {
            for (const selectedSlug of selectedActions) {
                const parts = selectedSlug.split(':');
                if (parts.length < 2) {
                    console.error(`[${MODULE_NAMESPACE}] executeInstantRoll: selectedSlug "${selectedSlug}" does not have enough parts. Expected format "prefix:slug" or "prefix:slug:statistic". Skipping.`);
                    continue;
                }
                const prefix = parts[0].toLowerCase();

                let currentDC = dc; // Start with default DC
                // Override DC if specified in skillDCs
                if (rollOptions.skillDCs && rollOptions.skillDCs[selectedSlug]) {
                    currentDC = rollOptions.skillDCs[selectedSlug];
                }

                switch (prefix) {
                    case 'skill': {
                        const skillSlug = parts[1];
                        if (!skillSlug) {
                            console.error(`[${MODULE_NAMESPACE}] executeInstantRoll: skillSlug is undefined for selectedSlug "${selectedSlug}". Skipping this skill.`);
                            continue;
                        }
                        // Execute skill roll with specific DC
                        await executeSkillRoll(actor, skillSlug, currentDC, {...rollOptions});
                        break;
                    }
                    case 'action': {
                        const actionSlug = parts[1];
                        const statistic = parts[2] || null;
                        if (!actionSlug) {
                            console.error(`[${MODULE_NAMESPACE}] executeInstantRoll: actionSlug is undefined for selectedSlug "${selectedSlug}". Skipping this action.`);
                            continue;
                        }
                        // Execute action roll with specific DC
                        await executeActionRoll(actor, actionSlug, statistic, currentDC, rollOptions, selectedStatistic);
                        break;
                    }
                    case 'save': {
                        const saveSlug = parts[1];
                        if (!saveSlug) {
                            console.error(`[${MODULE_NAMESPACE}] executeInstantRoll: saveSlug is undefined for selectedSlug "${selectedSlug}". Skipping this save.`);
                            continue;
                        }
                        // Execute save roll with specific DC
                        await executeSaveRoll(actor, saveSlug, currentDC, rollOptions);
                        break;
                    }
                    case 'perception': {
                        // Execute perception roll with specific DC
                        await executePerceptionRoll(actor, currentDC, rollOptions);
                        break;
                    }
                    default:
                        console.warn(`[${MODULE_NAMESPACE}] executeInstantRoll: Unhandled prefix "${prefix}" in selectedSlug "${selectedSlug}".`);
                        break; // Skip unhandled prefixes
                }
            }
        }
    } catch (error) {
        console.error(`[${MODULE_NAMESPACE}] executeInstantRoll: Error:`, error);
        ui.notifications.error('An error occurred during the instant roll. See console for details.');
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

    // **New Setting for Auto-Close**
    game.settings.register("pf2e-roll-manager", "autoCloseRollInterface", {
        name: "Auto Close Roll Interface",
        hint: "Automatically close the roll interface once all rolls have been made.",
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
        case 'criticalsuccess':
            indicator.textContent = "✅ Critical Success ✅";
            indicator.style.color = 'green';
            break;
        case 'success':
            indicator.textContent = "Success ✅";
            indicator.style.color = 'green';
            break;
        case 'failure':
            indicator.textContent = "Failure ❌";
            indicator.style.color = 'red';
            break;
        case 'criticalfailure':
            indicator.textContent = "❌ Critical Failure ❌";
            indicator.style.color = 'red';
            break;
        default:
            indicator.textContent = "Unknown result";
            indicator.style.color = 'gray';
    }
    return indicator;
}

function removeExistingContainer() {
    const existingContainer = document.getElementById('character-box-container');
    if (existingContainer) {
        existingContainer.remove();
        console.log("Existing character box container removed to prevent duplicates.");
    }
}

/**
 * Creates and appends both the dark overlay and the main container.
 *
 * @returns {HTMLElement} - The main container element.
 */
function createOverlayAndContainer() {
    createDarkOverlay(); // Create and append the dark overlay
    const container = createContainer(); // Create the main container
    document.body.appendChild(container); // Append the container to the body
    console.log(`[${MODULE_NAMESPACE}] Container and overlay created.`);
    return container;
}

async function appendHeading(container, skillsToRoll, dc, isBlindGM) {
    const heading = await createHeadingWithDC(skillsToRoll, dc, isBlindGM);
    container.appendChild(heading);
}

function appendExitButton(container) {
    const exitButton = createExitButton();
    container.appendChild(exitButton);
}

/**
 * Appends character boxes to the specified container.
 *
 * @param {HTMLElement} container - The container to append character boxes to.
 * @param {Array} selectedCharacters - The actors to display.
 * @param {Array} skillsToRoll - Skills or actions to include.
 * @param {number} dc - Difficulty Class for the rolls.
 * @param {boolean} isBlindGM - Indicates if the GM is blind.
 * @param {Object} skillDCs - Specific DCs for each skill/action.
 */
function appendCharacterBoxes(container, selectedCharacters, skillsToRoll, dc, isBlindGM, skillDCs) {
    selectedCharacters.forEach((actor, index) => {
        const box = createCharacterBox(actor, skillsToRoll, dc, isBlindGM, index, skillDCs);
        container.appendChild(box);
    });
}

function createCharacterBox(actor, skillsToRoll, dc, isBlindGM, index, skillDCsFromSocket) {
    const box = document.createElement('div');
    box.className = 'character-box fade-in';
    box.dataset.actorId = actor.id;
    box.dataset.actionName = ''; // Will be set after the roll

    // Styling for the character box
    box.style.margin = '10px';
    box.style.padding = '20px';
    box.style.backgroundColor = 'white';
    box.style.border = '1px solid black';
    box.style.borderRadius = '10px';
    box.style.textAlign = 'center';
    box.style.flex = '0 0 250px'; // Prevents growing and shrinking, sets width to 250px
    box.style.boxSizing = 'border-box';

    // Character Name
    const characterNameHeading = document.createElement('h2');
    characterNameHeading.textContent = actor.name;
    characterNameHeading.style.fontFamily = 'Arial, sans-serif';
    characterNameHeading.style.fontSize = '1.7em';
    characterNameHeading.style.marginBottom = '10px';
    box.appendChild(characterNameHeading);

    // Token Image
    const tokenImage = document.createElement('img');
    tokenImage.src = actor.prototypeToken.texture.src;
    tokenImage.alt = actor.name;
    tokenImage.style.width = '210px';
    tokenImage.style.height = '210px';
    tokenImage.style.display = 'block';
    tokenImage.style.margin = '0 auto';
    tokenImage.style.border = '0';
    tokenImage.style.padding = "10px";
    box.appendChild(tokenImage);

    // Fetch Skills, Saves, and Other Attributes
    const skills = getSkills(actor);
    const saves = getSaves(actor);
    const otherAttributes = getOtherAttributes(actor);
    const skillSelect = createSkillSelect(actor, skillsToRoll, skills, saves, otherAttributes);
    box.appendChild(skillSelect);

    // Fetch the 'showDCForRoll' setting
    const showDCForRoll = game.settings.get('pf2e-roll-manager', 'showDCForRoll');

    // Determine if DCs should be displayed
    const shouldShowDCs = game.user.isGM || showDCForRoll;

    // Create DC Inputs
    skillsToRoll.forEach(skillName => {
        const parts = skillName.split(':');
        const slug = parts[1].toLowerCase();
        const key = `${actor.id}:${slug}`;
        const initialDC = skillDCsFromSocket[key] || dc;

        const dcContainer = document.createElement('div');
        dcContainer.className = 'dc-container';
        dcContainer.style.marginTop = '10px';
        dcContainer.style.display = shouldShowDCs ? 'flex' : 'none'; // Updated condition

        const dcLabel = document.createElement('label');
        dcLabel.htmlFor = `dc-input-${slug}`;
        dcLabel.textContent = `${toTitleCase(formatSkillName(slug.replace(/-/g, ' ')))} DC: `;
        dcLabel.style.marginRight = '5px';

        const dcInput = document.createElement('input');
        dcInput.type = 'number';
        dcInput.id = `dc-input-${slug}`;
        dcInput.className = 'skill-dc-input';
        dcInput.dataset.slug = slug;
        dcInput.dataset.actorId = actor.id; // Add actor ID for unique identification
        dcInput.value = initialDC;
        dcInput.min = 1;
        dcInput.max = 60;
        dcInput.style.width = '60px';
        dcInput.placeholder = 'DC';

        // Restrict editing to GM only
        if (!game.user.isGM) {
            dcInput.readOnly = true; // Players cannot edit DC
            // Alternatively, you can use:
            // dcInput.disabled = true;
        }

        // Event listener for GM to emit DC changes
        if (game.user.isGM) {
            dcInput.addEventListener('change', (event) => {
                const newDC = parseInt(event.target.value, 10);
                if (!isNaN(newDC)) {
                    // Update the central skillDCs object
                    skillDCsFromSocket[key] = newDC;
                    // Emit a socket event with the actorId, skillSlug, and newDC
                    socketInstance.executeForEveryone('updateDCInput', {
                        actorId: actor.id, skillSlug: slug, newDC: newDC
                    });
                    console.log(`[${MODULE_NAMESPACE}] DC input changed for actor ${actor.id}, skill ${slug}: new DC = ${newDC}`);
                }
            });
        }

        dcContainer.appendChild(dcLabel);
        dcContainer.appendChild(dcInput);
        box.appendChild(dcContainer);
    });

    // Roll Buttons
    const rollButton = document.createElement('button');
    rollButton.textContent = 'Roll';
    rollButton.style.display = 'block';
    rollButton.style.margin = '10px auto';
    box.appendChild(rollButton);

    const rollBlindButton = document.createElement('button');
    rollBlindButton.textContent = 'Roll Blind GM';
    rollBlindButton.style.display = 'block';
    rollBlindButton.style.margin = '10px auto';
    box.appendChild(rollBlindButton);

    // Result and Indicator Areas
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

    // Attach the modified event listeners with ownership checks
    if (!isBlindGM && rollButton) {
        addRollButtonEventListener(rollButton, actor, skillSelect, box, dc, skillDCsFromSocket);
    }
    addRollBlindButtonEventListener(rollBlindButton, actor, skillSelect, box, dc, skillDCsFromSocket);

    return box;
}

/**
 * Updates the character box UI with the roll result.
 *
 * @param {Object} data - The data containing roll results.
 * @param {string} data.actorId - The ID of the actor.
 * @param {Object} data.skillOrSaveKey - The key representing the skill or save.
 * @param {Object} data.result - The result object containing degreeOfSuccess and total.
 * @param {boolean} data.isBlindRoll - Indicates if the roll was blind.
 */
function updateRollResultInCharacterBox(data) {
    const {actorId, skillOrSaveKey, result, isBlindRoll} = data;
    const {degreeOfSuccess, total} = result;

    console.log(`Updating roll result in character box for actor: ${actorId}`, data);

    const characterBox = document.querySelector(`.character-box[data-actor-id="${actorId}"]`);
    if (!characterBox) {
        console.warn(`Character box for actor ID ${actorId} not found.`);
        return;
    }

    const resultArea = characterBox.querySelector('.result-area');
    const indicatorArea = characterBox.querySelector('.indicator-area');

    // If resultArea or indicatorArea is missing, do nothing
    if (!resultArea || !indicatorArea) {
        console.warn(`Result or indicator area missing for actor ID ${actorId}. Skipping update.`);
        return;
    }

    // Retrieve the diceRollDelay setting (default to 3000ms if not set)
    const diceRollDelay = game.settings.get("pf2e-roll-manager", "diceRollDelay") || 3000;
    console.log(`[${MODULE_NAMESPACE}] Applying diceRollDelay: ${diceRollDelay} ms`);

    // Use setTimeout to delay the UI update
    setTimeout(() => {
        // Display the roll result
        resultArea.innerHTML = `<p><strong>Result:</strong> ${isBlindRoll && !game.user.isGM ? '???' : total}</p>`;

        // Create and append the new indicator
        const indicator = createIndicator(isBlindRoll && !game.user.isGM ? '???' : degreeOfSuccess);
        indicatorArea.innerHTML = ''; // Clear previous indicator
        indicatorArea.appendChild(indicator);

        // **Track the roll completion**
        rolledCharacterBoxes.add(actorId);
        console.log(`Character ${actorId} has rolled. Total rolled: ${rolledCharacterBoxes.size}/${totalCharacterBoxes}`);

        // **Check if all rolls are completed**
        if (rolledCharacterBoxes.size === totalCharacterBoxes) {
            const autoClose = game.settings.get("pf2e-roll-manager", "autoCloseRollInterface");

            if (autoClose && autoCloseTimeout === null) {
                const fadeOutDelay = game.settings.get("pf2e-roll-manager", "timeBeforeFadeOut") || 6000;
                console.log(`All character boxes have rolled. Auto-closing in ${fadeOutDelay} ms.`);
                autoCloseTimeout = setTimeout(() => {
                    // Emit a socket event to instruct all clients to close the interface
                    socketInstance.executeForEveryone("autoCloseRollInterface");
                    console.log(`[${MODULE_NAMESPACE}] Auto-close event emitted to all clients.`);
                }, fadeOutDelay); // Use the configured fadeOutDelay
            }
        }
    }, diceRollDelay);
}

/**
 * Generates and displays character roll boxes for the specified actors and skills.
 *
 * @param {Actor[]} actors - The actors to generate roll boxes for.
 * @param {string[]} skillsToRoll - An array of skill/action slugs with prefixes.
 * @param {number} dc - Difficulty Class for the rolls.
 * @param {boolean} isBlindGM - Indicates if the GM is blind.
 * @param {Object} skillDCsFromSocket - Specific DCs for each skill/action.
 * @returns {Promise<void>}
 */
async function generateCharacterRollBoxes(actors, skillsToRoll, dc, isBlindGM, skillDCsFromSocket = {}) {
    // Filter out any null actors
    const filteredActors = actors.filter(actor => actor !== null);

    if (filteredActors.length === 0) {
        console.warn(`[${MODULE_NAMESPACE}] No valid actors provided to generateCharacterRollBoxes.`);
        return;
    }

    // Initialize tracking variables
    totalCharacterBoxes = filteredActors.length;
    rolledCharacterBoxes = new Set();

    // Clear any existing auto-close timeout
    if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = null;
    }

    // Update selectedCharacterIds based on the actors being rolled
    selectedCharacterIds = new Set(filteredActors.map(actor => actor.id));
    savePersistedSelections(); // Persist the updated selections

    // Proceed to displayCharacterRollBoxes
    await displayCharacterRollBoxes(filteredActors, skillsToRoll, dc, isBlindGM, skillDCsFromSocket);
    console.log(`[${MODULE_NAMESPACE}] generateCharacterRollBoxes: Displayed roll boxes for ${filteredActors.length} actor(s).`);
}

/**
 * Adds a click event listener to the "Roll" button, ensuring the user owns the actor before allowing the roll.
 *
 * @param {HTMLElement} rollButton - The "Roll" button element.
 * @param {Actor} character - The actor associated with the roll.
 * @param {HTMLElement} skillSelect - The skill selection dropdown element.
 * @param {HTMLElement} box - The character box container element.
 * @param {number} defaultDC - The default Difficulty Class (DC) for the roll.
 * @param {Object} skillDCsFromSocket - Specific DCs received via socket communication.
 */
function addRollButtonEventListener(rollButton, character, skillSelect, box, defaultDC, skillDCsFromSocket) {
    rollButton.addEventListener('click', async () => {
        // Ownership Check
        if (!character.isOwner) {
            ui.notifications.warn(`You do not have ownership of ${character.name}.`);
            console.warn(`[${MODULE_NAMESPACE}] User ${game.user.name} attempted to roll for ${character.name} without ownership.`);
            return; // Prevent further execution
        }

        const selectedPrefixedSlug = skillSelect.value;
        const selectedActions = [selectedPrefixedSlug];
        const selectedActors = [character];

        // Extract the slug part
        const parts = selectedPrefixedSlug.split(':');
        const slug = parts[1].toLowerCase();

        const dcInput = box.querySelector(`.skill-dc-input[data-slug="${slug}"]`);
        if (!dcInput) {
            console.error(`DC input not found for slug: "${slug}"`);
            ui.notifications.error(`DC input not found for "${slug}".`);
            return;
        }
        const dc = parseInt(dcInput.value, 10) || defaultDC;

        // Build the skillDCs object with the current DC
        const skillDCs = {};
        skillDCs[selectedPrefixedSlug] = dc;

        // Execute the roll with the specific DC
        await executeInstantRoll(selectedActors, selectedActions, defaultDC, // Provide the default DC
            true, // createMessage
            undefined, // skipDialog
            'publicroll', // rollMode
            null, // selectedStatistic
            false, // fromDialog
            false, // secret
            {skillDCs} // Pass the skillDCs object
        );
    });
}

/**
 * Adds a click event listener to the "Roll Blind GM" button, ensuring the user owns the actor before allowing the roll.
 *
 * @param {HTMLElement} rollButton - The "Roll Blind GM" button element.
 * @param {Actor} character - The actor associated with the roll.
 * @param {HTMLElement} skillSelect - The skill selection dropdown element.
 * @param {HTMLElement} box - The character box container element.
 * @param {number} defaultDC - The default Difficulty Class (DC) for the roll.
 * @param {Object} skillDCsFromSocket - Specific DCs received via socket communication.
 */
function addRollBlindButtonEventListener(rollButton, character, skillSelect, box, defaultDC, skillDCsFromSocket) {
    rollButton.addEventListener('click', async () => {
        // Ownership Check
        if (!character.isOwner) {
            ui.notifications.warn(`You do not have ownership of ${character.name}.`);
            console.warn(`[${MODULE_NAMESPACE}] User ${game.user.name} attempted to blind roll for ${character.name} without ownership.`);
            return; // Prevent further execution
        }

        const selectedPrefixedSlug = skillSelect.value;
        const selectedActions = [selectedPrefixedSlug];
        const selectedActors = [character];

        // Extract the slug part
        const parts = selectedPrefixedSlug.split(':');
        const slug = parts[1].toLowerCase();

        const dcInput = box.querySelector(`.skill-dc-input[data-slug="${slug}"]`);
        if (!dcInput) {
            console.error(`DC input not found for slug: "${slug}"`);
            ui.notifications.error(`DC input not found for "${slug}".`);
            return;
        }

        const dc = parseInt(dcInput.value, 10) || defaultDC;

        // Execute the instant roll with the specific DC
        await executeInstantRoll(selectedActors, selectedActions, dc, true, // createMessage
            undefined, // skipDialog
            'blindroll', // rollMode
            null, // selectedStatistic
            false, // fromDialog
            true, // secret
            {skillDCs: {[selectedPrefixedSlug]: dc}}); // Pass the skillDCs object

        // After the roll, remove the resultArea and indicatorArea for non-GMs
        if (!game.user.isGM) {
            const resultArea = box.querySelector('.result-area');
            const indicatorArea = box.querySelector('.indicator-area');
            if (resultArea) resultArea.remove();
            if (indicatorArea) indicatorArea.remove();
        }
    });
}

/**
 * Fades out and removes a specified element after a delay.
 *
 * @param {HTMLElement} element - The element to fade out and remove.
 * @param {number} delay - The delay in milliseconds before removal.
 */
function fadeOutAndRemoveElement(element, delay) {
    if (element) {
        element.classList.remove('visible');
        element.classList.add('fade-out');
        setTimeout(() => {
            element.remove();
        }, delay);
    }
}

/**
 * Removes all relevant elements, including character boxes, exit button, overlay, and heading.
 */
function removeElements() {
    const fadeOutDelay = 500; // Uniform fade-out duration in milliseconds

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

/**
 * Creates and appends a dark overlay to the document body.
 * The overlay is semi-transparent, dark, and does not block pointer events.
 *
 * @returns {HTMLElement} - The overlay element.
 */
function createDarkOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'dark-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'black';
    overlay.style.opacity = '0.33'; // 33% opacity
    overlay.style.pointerEvents = 'none'; // Allows clicks to pass through
    overlay.style.zIndex = '98'; // Ensure it's below the character-box-container
    overlay.style.transition = 'opacity 0.5s ease'; // Optional: Smooth transition
    document.body.appendChild(overlay);
    console.log(`[${MODULE_NAMESPACE}] Dark overlay created.`);
    return overlay;
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

function sendResultsToGM() {
    const gmUser = game.users.find(user => user.isGM);
    if (!gmUser) {
        console.warn('No GM found to send results to.');
        return;
    }
    let resultSummaries = [];
    const characterBoxes = document.querySelectorAll('.character-box');
    characterBoxes.forEach(characterBox => {
        const characterName = characterBox.querySelector('h2').textContent;
        const skillOrSaveKey = characterBox.querySelector('select').value.split(':').pop(); // Get only the last part
        const resultText = characterBox.querySelector('.result-area').textContent.trim();
        const indicatorText = characterBox.querySelector('.indicator-area').textContent.trim();
        resultSummaries.push(`${characterName} - ${toTitleCase(skillOrSaveKey.replace(/-/g, ' '))}: ${resultText} (${indicatorText})`);
    });
    const summaryText = resultSummaries.join("<br>");
    ChatMessage.create({
        user: game.user.id, content: summaryText, whisper: [gmUser.id], blind: false
    });
}

/**
 * Creates the main container with a columnar flex layout.
 * @returns {HTMLElement} - The container element.
 */
function createContainer() {
    const container = document.createElement('div');
    container.id = 'character-box-container';
    container.classList.add('interactive-overlay');
    container.style.position = 'fixed';
    container.style.width = '87%';
    container.style.height = '90%';
    container.style.top = '55%';
    container.style.left = '45%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column'; // Stack children vertically
    container.style.alignItems = 'center'; // Center children horizontally
    container.style.overflowY = 'auto'; // Enable vertical scrolling if content overflows
    container.style.zIndex = '99';

    // Optional: Add padding and background for better aesthetics
    container.style.padding = '20px';
    container.style.borderRadius = '10px';


    return container;
}

/**
 * Generates and displays character roll boxes.
 *
 * @param selectedCharacters
 * @param {Array} skillsToRoll - An array of skill/action slugs with prefixes.
 * @param {number} dc - Difficulty Class for the rolls.
 * @param {boolean} isBlindGM - Indicates if the GM is blind.
 * @param {Object} skillDCs - Specific DCs for each skill/action.
 */
async function displayCharacterRollBoxes(selectedCharacters, skillsToRoll, dc, isBlindGM, skillDCs) {
    console.log("Displaying character roll boxes...");

    // Remove any existing container to prevent duplicates
    removeExistingContainer();

    // Create the main container
    const container = createOverlayAndContainer();
    document.body.appendChild(container);

    // Append Heading at the Top
    await appendHeading(container, skillsToRoll, dc, isBlindGM);

    // Create a separate container for character boxes
    const characterBoxesContainer = document.createElement('div');
    characterBoxesContainer.className = 'character-boxes-container';
    characterBoxesContainer.style.display = 'flex';
    characterBoxesContainer.style.flexDirection = 'row';
    characterBoxesContainer.style.flexWrap = 'wrap';
    characterBoxesContainer.style.justifyContent = 'center';
    characterBoxesContainer.style.width = '90%';
    container.appendChild(characterBoxesContainer);

    // Append Character Boxes Inside the characterBoxesContainer
    appendCharacterBoxes(characterBoxesContainer, selectedCharacters, skillsToRoll, dc, isBlindGM, skillDCs);

    // Append Exit Button Below the Character Boxes
    appendExitButton(container);
}

/**
 * Creates a heading element with the formatted skills/actions and DC.
 *
 * @param {Array<string>} skillsToRoll - An array of skill/action slugs with prefixes.
 * @param {number} dc - The Difficulty Class for the roll.
 * @param {boolean} isBlindGM - Indicates if the roll is a blind GM roll.
 * @returns {HTMLElement} - The heading element.
 */
async function createHeadingWithDC(skillsToRoll, dc, isBlindGM) {
    let formattedSkills;
    try {
        formattedSkills = skillsToRoll.map(skill => {
            if (typeof skill !== 'string') {
                console.warn(`Invalid skill type: expected string but got ${typeof skill}`);
                return 'Unknown Skill';
            }
            const parts = skill.split(':');
            // Ensure there are at least two parts: prefix and slug
            if (parts.length < 2) {
                console.warn(`Invalid skill slug format: "${skill}". Expected at least two parts separated by ':'`);
                return 'Unknown Skill';
            }
            // Extract the skill/action name
            let actionName = toTitleCase(parts[1].replace(/-/g, ' '));
            // If there's a third part, include it as a variant/statistic
            if (parts.length > 2) {
                actionName += ` (${toTitleCase(parts[2].replace(/-/g, ' '))})`;
            }
            return actionName;
        }).join(', ');
    } catch (error) {
        console.error('Error formatting skills:', error);
        formattedSkills = 'Unknown Skills';
    }

    const showDCForRoll = await game.settings.get('pf2e-roll-manager', 'showDCForRoll') && !isBlindGM;
    const heading = document.createElement('h1');
    heading.textContent = showDCForRoll ? `The GM would like you to attempt a roll: ${formattedSkills} - DC: ${dc}` : `The GM would like you to attempt a roll: ${formattedSkills}`;
    heading.style.color = 'white';
    heading.style.fontFamily = 'Arial, sans-serif';
    heading.style.fontSize = '2em';
    heading.style.marginBottom = '10px';
    heading.style.textAlign = 'center';

    // Informational Text for GM Only
    if (game.user.isGM) {
        const dcStatusText = document.createElement('p');
        dcStatusText.textContent = showDCForRoll ? "🔍 DCs are currently visible to players." : "🔒 DCs are currently hidden from players.";
        dcStatusText.style.fontSize = '0.6em';
        dcStatusText.style.fontStyle = 'italic';
        dcStatusText.style.marginTop = '10px';
        dcStatusText.style.textAlign = 'center';
        dcStatusText.style.color = '#FFD700'; // Gold color for visibility
        heading.appendChild(dcStatusText);

        const settingsInfoText = document.createElement('p');
        settingsInfoText.textContent = "You can change this option in the Roll Manager settings.";
        settingsInfoText.style.fontSize = '0.6em';
        settingsInfoText.style.fontStyle = 'italic';
        settingsInfoText.style.marginTop = '2px';
        settingsInfoText.style.color = '#FFD700'; // Gold color for visibility
        settingsInfoText.style.textAlign = 'center';
        heading.appendChild(settingsInfoText);
    }

    return heading;
}

class ResultsManager {
    constructor() {
        this.results = [];
    }

    addResult(result) {
        this.results.push(result);
    }
}

const resultsManager = new ResultsManager();

/**
 * Transforms a label by replacing hyphens with spaces and converting to title case.
 * @param {string} label
 * @returns {string}
 */
function transformLabel(label) {
    return toTitleCase(label.replace(/-/g, ' '));
}

/**
 * Calculates the default DC based on character level.
 * @param {number} level
 * @returns {number}
 */
function calculateDefaultDC(level) {
    const dcByLevel = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 32, 33, 34, 36, 37, 38, 40, 42, 44, 46, 48, 50];
    if (level < 0) return dcByLevel[0];
    if (level >= dcByLevel.length) return dcByLevel[dcByLevel.length - 1];
    return dcByLevel[level];
}

/**
 * Converts a string to Title Case.
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Groups actions by their associated statistics, excluding specified actions.
 *
 * @param {Map<string, Object>} actions - A map where keys are action slugs and values are action objects containing details like name, statistic, and variants.
 * @param {string[]} excludeActions - An array of action slugs to exclude from the grouping.
 * @returns {Object.<string, Array<{name: string, slug: string, statistic: string}>>} - An object where each key is a statistic and the value is an array of actions associated with that statistic.
 */
function groupActionsByStatistic(actions, excludeActions) {
    const groupedActions = {};
    for (const [key, action] of actions.entries()) {
        if (excludeActions.includes(key)) {
            console.log(`groupActionsByStatistic: Excluding action: "${key}"`);
            continue; // Skip excluded actions
        }

        if (!action.statistic || action.statistic === "unknown") {
            console.warn(`groupActionsByStatistic: Action "${key}" has an unsupported or unknown statistic. Skipping.`);
            continue;
        }

        const stat = Array.isArray(action.statistic) ? 'Multiple' : action.statistic;
        if (!groupedActions[stat]) {
            groupedActions[stat] = [];
        }
        if (!action.name || !key) {
            console.warn(`groupActionsByStatistic: Action "${key}" is missing a name or key. Skipping.`);
            continue;
        }
        groupedActions[stat].push({
            name: game.i18n.localize(action.name), slug: key, statistic: action.statistic,
        });
        console.log(`groupActionsByStatistic: Added action "${key}" to category "${stat}".`);

        if (action.variants) {
            for (const variant of action.variants) {
                if (!variant.slug || !variant.name) {
                    console.warn(`groupActionsByStatistic: Variant for action "${key}" is missing a slug or name. Skipping.`);
                    continue;
                }
                groupedActions[stat].push({
                    name: `${game.i18n.localize(action.name)} (${game.i18n.localize(variant.name)})`,
                    slug: `${key}:${variant.slug}`,
                    statistic: variant.statistic || action.statistic,
                });
                console.log(`groupActionsByStatistic: Added variant action "${key}:${variant.slug}" to category "${stat}".`);
            }
        }
    }
    console.log("groupActionsByStatistic: Grouped Actions:", groupedActions);
    return groupedActions;
}

/**
 * Builds an HTML string for skill buttons, ensuring each skill has a valid slug and name.
 *
 * @param {Array<{name: string, slug: string, statistic?: string}>} skills - An array of skill or action objects containing name, slug, and optionally statistic.
 * @param {string} [prefix=''] - A prefix to prepend to each skill's slug (e.g., 'skill:', 'action:').
 * @returns {string} - The generated HTML string containing buttons and DC input fields for each skill/action.
 */
function buildSkillButtonsHtml(skills, prefix = '') {
    return `
        ${skills.map(a => {
        if (!a.slug || !a.name) {
            console.warn(`buildSkillButtonsHtml: Missing slug or name for skill/action:`, a);
            return ''; // Skip buttons with undefined slugs or names
        }
        const fullSlug = `${prefix}${a.slug}${a.statistic ? ':' + a.statistic : ''}`;
        return `
            <button type="button" 
                class="skill-button" 
                data-full-slug="${fullSlug}" 
                data-slug="${a.slug}" 
                data-statistic="${a.statistic}">
                ${toTitleCase(transformLabel(a.name))}
            </button>
            <input type="number" 
                class="skill-dc-input" 
                data-full-slug="${fullSlug}"
                data-slug="${a.slug}" 
                placeholder="DC" 
                min="1" 
                max="60" 
                style="display: none; width: 60px; margin-left: 10px;">
            `;
    }).join('\n')}
    `;
}

/**
 * Builds an HTML string for the character selection grid, including buttons with associated character images and names.
 *
 * @returns {string} - The generated HTML string containing character selection buttons, excluding hidden characters.
 */
function buildCharacterSelectionHtml() {
    const playerCharacters = game.actors.filter(actor => actor.hasPlayerOwner && actor.type === "character");
    const hiddenCharacters = JSON.parse(localStorage.getItem('hiddenCharacters')) || [];
    console.log(`buildCharacterSelectionHtml: Building character selection HTML. Total characters: ${playerCharacters.length}, Hidden: ${hiddenCharacters.length}`);
    return `
        ${playerCharacters
        .filter(actor => !hiddenCharacters.includes(actor.id))
        .map(actor => {
            const tokenImage = actor.prototypeToken.texture.src;
            return `
    <div class="character-selection">
        <input type="checkbox" id="checkbox-${actor.id}" style="display: none;" />
        <button type="button" class="character-select-button" id="button-${actor.id}" data-actor-id="${actor.id}">
            <img src="${tokenImage}" alt="${actor.name}" class="character-token-image">
            ${actor.name}
        </button>
    </div>
                `;
        })
        .join('\n')}
    `;
}

/**
 * Builds the overall content HTML for the action dropdown dialog.
 *
 * @param {Object} options - Contains all necessary HTML snippets.
 * @param {string} options.perceptionButtonHtml - HTML string for perception buttons.
 * @param {string} options.majorSkillButtonsHtml - HTML string for major skill buttons.
 * @param {string} options.skillButtonsHtml - HTML string for grouped skill/action buttons.
 * @param {string} options.savingThrowsButtonsHtml - HTML string for saving throw buttons.
 * @param {string} options.recallKnowledgeButtonsHtml - HTML string for recall knowledge buttons.
 * @param {string} options.characterSelectionHtml - HTML string for character selection grid.
 * @returns {string} - The complete HTML string for the dialog content.
 */
function buildDialogContent(options) {
    const {
        perceptionButtonHtml,
        majorSkillButtonsHtml,
        skillButtonsHtml,
        savingThrowsButtonsHtml,
        recallKnowledgeButtonsHtml,
        characterSelectionHtml
    } = options;

    return `
        <form>
            <input type="text" id="search-bar" placeholder="Filter skills..." style="margin-bottom: 10px; width: 100%; padding: 5px;">
            <details id="skill-save-section" class="details-section">
                <summary class="details-summary">Perception, Skills, Actions, and Saving Throws</summary>
                <div class="skill-form-group flex-container">
                    ${perceptionButtonHtml}
                    ${majorSkillButtonsHtml}
                    ${skillButtonsHtml}
                    <details id="saving-throws-section" class="details-section">
                        <summary class="details-summary">Saving Throws</summary>
                        <div class="skill-buttons-row flex-container">
                            ${savingThrowsButtonsHtml}
                        </div>
                    </details>
                    <details id="recall-knowledge-section" class="details-section">
                        <summary class="details-summary">Recall Knowledge</summary>
                        <div class="skill-buttons-row flex-container">
                            ${recallKnowledgeButtonsHtml}
                        </div>
                    </details>
                </div>
                <hr>
                <br>
                <button type="button" id="character-visibility-button">Manage Character Visibility</button>
            </details>
            <hr />
            <!-- Include the character selection grid here -->
            <div class="character-selection-grid">
                ${characterSelectionHtml}
            </div>
            <div class="kofi-donation">
                <label>Want to support this module? Please consider a <a href="https://ko-fi.com/mythicamachina">donation</a> to help pay for development.</label>
                <a href="https://ko-fi.com/mythicamachina">
                    <img src="modules/pf2e-roll-manager/img/kofilogo.png" alt="Ko-Fi Logo" style="height: 25px; border: none;" />
                </a>
            </div>
            <div><hr></div>
        </form>
    `;
}

/**
 * Attaches event listeners to elements within the action dropdown dialog after it has been rendered.
 *
 * @param {jQuery} html - The jQuery object representing the rendered dialog HTML.
 * @returns {void}
 */
function attachDialogEventListeners(html) {
    console.log("attachDialogEventListeners: Attaching event listeners.");

    // DC Adjustment
    const updateDC = (value) => {
        value = Math.min(Math.max(value, 1), 60);
        console.log(`attachDialogEventListeners: Updating DC to: ${value}`);
        html.find('#dc-slider-value').text(value);
        html.find('#dc-slider').val(value);
        html.find('#dc-input').val(value);
    };

    html.find('#dc-slider').on('input', (event) => {
        console.log("attachDialogEventListeners: DC slider input changed.");
        updateDC(event.target.value);
    });

    html.find('#dc-input').on('change', (event) => {
        console.log("attachDialogEventListeners: DC input field changed.");
        updateDC(event.target.value);
    });

    html.find('.dc-adjustment-button').on('click', (event) => {
        console.log(`attachDialogEventListeners: DC adjustment button clicked: ${event.currentTarget.dataset.dc}`);
        updateDC(event.currentTarget.dataset.dc);
    });

    html.find('.standard-dc-button').on('click', (event) => {
        console.log(`attachDialogEventListeners: Standard DC button clicked: ${event.currentTarget.dataset.dc}`);
        updateDC(event.currentTarget.dataset.dc);
    });

    // Skill Button Clicks
    html.find('.skill-button').on('click', (event) => {
        const button = $(event.currentTarget);
        button.toggleClass('selected');
        const slug = button.data('slug');
        const fullSlug = button.data('full-slug');
        const isSelected = button.hasClass('selected');
        console.log(`attachDialogEventListeners: Skill button toggled: "${fullSlug}" (${slug}), selected: ${isSelected}`);
        const dcInput = html.find(`.skill-dc-input[data-slug="${slug}"]`);
        if (isSelected) {
            dcInput.show();
            console.log(`attachDialogEventListeners: Showing DC input for: "${slug}"`);
        } else {
            dcInput.hide();
            console.log(`attachDialogEventListeners: Hiding DC input for: "${slug}"`);
        }
    });

    // Attach character selection listeners
    console.log("attachDialogEventListeners: Attaching character selection listeners...");
    const characterGrid = html.find('.character-selection-grid')[0];
    if (characterGrid) {
        attachCharacterSelectionListeners(characterGrid);
    } else {
        console.warn("attachDialogEventListeners: Character selection grid not found in dialog.");
    }

    // Search Bar Functionality
    const searchBar = html.find('#search-bar');
    searchBar.on('input', () => {
        const searchTerm = searchBar.val().toLowerCase();
        console.log(`attachDialogEventListeners: Search bar input: "${searchTerm}"`);

        // Filter skill buttons and associated inputs
        html.find('.skill-button').each((_, button) => {
            const $button = $(button);
            const label = $button.text().toLowerCase();
            const isVisible = label.includes(searchTerm);
            $button.toggle(isVisible);

            // Also toggle visibility of associated DC input
            $button.next('.skill-dc-input').toggle(isVisible);

            console.log(`attachDialogEventListeners: Filtering skill "${label}": Visible=${isVisible}`);

            // Ensure that the stat section remains open if it has visible buttons
            const statSection = $button.closest('.stat-section');
            if (statSection.length) {
                const hasVisibleButtons = statSection.find('.skill-button:visible').length > 0;
                statSection.prop('open', hasVisibleButtons);
                console.log(`attachDialogEventListeners: Stat section "${statSection.attr('id')}" open: ${hasVisibleButtons}`);
            }
        });

        // Show all character buttons regardless of the search term
        html.find('.character-select-button').show();
        console.log("attachDialogEventListeners: Ensured all character buttons are visible.");
    });

    // Character Visibility Button
    html.find('#character-visibility-button').on('click', () => {
        console.log("attachDialogEventListeners: 'Manage Character Visibility' button clicked.");
        buildCharacterVisibilityDialog();
    });

    // Adjust dialog size to 70% of the viewport
    setTimeout(() => {
        const dialogElement = html.closest('.app.dialog');
        dialogElement.css({
            'width': '70vw',    // 70% of the viewport width
            'height': '70vh',   // 70% of the viewport height
            'top': '50%',       // Position top at 50%
            'left': '50%',      // Position left at 50%
            'transform': 'translate(-50%, -50%)' // Translate to center
        });
        dialogElement.find('.window-content').css({
            'height': 'calc(100% - 30px)'
        });
        console.log("attachDialogEventListeners: Adjusted size to 70% width and height and centered the dialog.");
    }, 10);
}

/**
 * Executes a skill roll for a specific actor and skill.
 *
 * @param {Actor} actor - The actor performing the roll.
 * @param {string} skillSlug - The raw skill slug to roll (e.g., 'deception').
 * @param {number} dc - The Difficulty Class (DC) for the roll.
 * @param {Object} rollOptions - Additional options for the roll, such as rollMode, secret, etc.
 * @returns {Promise<{total: number, outcome: string, roll: Roll} | null>} - The roll result containing total, outcome, and the Roll object, or null if the roll failed.
 */
async function executeSkillRoll(actor, skillSlug, dc, rollOptions) {
    console.log(`Executing skill roll for actor: ${actor.name}, skill: ${skillSlug}, DC: ${dc}, rollOptions:`, rollOptions);

    // Access the skill data directly from actor.system.skills
    const skillData = actor.system.skills[skillSlug];
    if (!skillData) {
        console.error(`Skill "${skillSlug}" not found for actor "${actor.name}".`);
        ui.notifications.error(`Skill "${skillSlug}" not found for actor "${actor.name}".`);
        return null;
    }

    try {
        // Construct the roll formula using the skill's total modifier
        const roll = await actor.skills[skillSlug].roll({
            ...rollOptions, difficultyClass: {value: dc}, // Correctly pass DC
            flags: mergeObject(rollOptions.flags || {}, {
                pf2e: {
                    context: {
                        difficultyClass: {value: dc}
                    }
                }
            }, {inplace: true}) // Ensure flags are correctly set
        });

        // Determine the outcome based on the total and DC
        const outcome = determineOutcome(roll.total, dc);

        // Prepare message options
        const messageOptions = {
            speaker: ChatMessage.getSpeaker({
                actor
            }), rollMode: rollOptions.rollMode || "publicroll" // Use 'publicroll' as default unless specified
        };

        // If the roll is blind (GM only), make it secret by setting whisper to GM users
        if (rollOptions.secret || rollOptions.rollMode === 'blindroll') {
            messageOptions.whisper = gmUserIds; // Send the roll only to GM users
            messageOptions.blind = true; // Mark the roll as blind
            messageOptions.secret = true;
            messageOptions.rollMode = 'blindroll'; // Ensure the rollMode is set to 'blindroll'
        }

        return {
            total: roll.total, outcome: outcome, roll
        };
    } catch (error) {
        console.error(`Error rolling skill ${skillSlug}:`, error);
        ui.notifications.error(`Failed to roll skill "${skillSlug}". See console for details.`);
        return null;
    }
}

/**
 * Executes a perception roll for a specific actor.
 *
 * @param {Actor} actor - The actor performing the perception roll.
 * @param {number} dc - The Difficulty Class (DC) for the roll.
 * @param {Object} rollOptions - Additional options for the roll, such as rollMode, secret, etc.
 * @returns {Promise<{total: number, outcome: string, roll: Roll} | null>} - The roll result containing total, outcome, and the Roll object, or null if the roll failed.
 */
async function executePerceptionRoll(actor, dc, rollOptions) {
    try {
        // Use the built-in perception roll method
        const perception = actor.perception;
        if (!perception) {
            throw new Error(`Perception not found for actor "${actor.name}".`);
        }

        // Execute the perception roll using the built-in method
        const roll = await perception.roll({
            ...rollOptions
        });

        // Determine the outcome based on the total and DC
        const outcome = determineOutcome(roll.total, dc);

        return {
            total: roll.total, outcome: outcome, roll
        };
    } catch (error) {
        console.error(`Error rolling perception:`, error);
        ui.notifications.error(`Failed to roll perception for "${actor.name}". See console for details.`);
        return null;
    }
}

/**
 * Executes a saving throw roll for a specific actor and save type.
 *
 * @param {Actor} actor - The actor performing the saving throw.
 * @param {string} saveSlug - The save type to roll (e.g., 'fortitude', 'reflex', 'will').
 * @param {number} dc - The Difficulty Class (DC) for the saving throw.
 * @param {Object} rollOptions - Additional options for the roll, such as rollMode, secret, etc.
 * @returns {Promise<{total: number, outcome: string, roll: Roll} | null>} - The roll result containing total, outcome, and the Roll object, or null if the roll failed.
 */
async function executeSaveRoll(actor, saveSlug, dc, rollOptions) {
    try {
        const roll = await actor.saves[saveSlug].roll({
            ...rollOptions, dc: dc // Pass DC directly
        });
        return {total: roll.total, outcome: determineOutcome(roll.total, dc), roll};
    } catch (error) {
        console.error(`Error rolling save ${saveSlug}:`, error);
        ui.notifications.error(`Failed to roll save ${saveSlug}. See console for details.`);
        return null;
    }
}

/**
 * Executes an action roll for a specific actor and action.
 *
 * @param {Actor} actor - The actor performing the action roll.
 * @param {string} actionSlug - The action slug to roll (e.g., 'recall-knowledge').
 * @param {string|null} variantSlug - The variant slug or statistic to use for the action (e.g., 'nature').
 * @param {number} difficultyClass - The Difficulty Class (DC) for the roll.
 * @param {Object} rollOptions - Additional options for the roll, such as traits, rollMode, secret, etc.
 * @param {string|null} selectedStatistic - The selected statistic for the action, if any.
 * @returns {Promise<{total: number, outcome: string, roll: Roll} | null>} - The roll result containing total, outcome, and the Roll object, or null if the roll failed.
 */
async function executeActionRoll(actor, actionSlug, variantSlug, difficultyClass, rollOptions, selectedStatistic) {
    try {
        console.log(`Executing action roll for actor: ${actor.name}, action: "${actionSlug}", variant: "${variantSlug}", DC: ${difficultyClass}, rollOptions:`, rollOptions);

        // Access the action using the PF2e API
        const action = game.pf2e.actions.get(actionSlug);
        if (!action) {
            throw new Error(`Action "${actionSlug}" not found.`);
        }

        // Prepare the options object
        const options = {};

        // Include the statistic (skill or ability) to use
        if (selectedStatistic) {
            options.statistic = selectedStatistic;
            console.log(`Set statistic to: "${selectedStatistic}"`);
        } else if (variantSlug) {
            options.statistic = variantSlug;
            console.log(`Set statistic to variant: "${variantSlug}"`);
        }

        // **Inject difficultyClass into Top-Level Property**
        if (difficultyClass) {
            options.difficultyClass = {value: difficultyClass};
            console.log(`Injected difficultyClass as top-level property: options.difficultyClass.value = ${difficultyClass}`);
        }

        // **Inject difficultyClass within Flags**
        if (difficultyClass) {
            options.flags = mergeObject(options.flags || {}, {
                pf2e: {
                    context: {
                        difficultyClass: {
                            value: difficultyClass
                        }
                    }
                }
            }, {inplace: true});
            console.log(`Injected difficultyClass within flags: options.flags.pf2e.context.difficultyClass.value = ${difficultyClass}`);
        }

        // Ensure traits is an array and include traits from rollOptions
        options.traits = rollOptions.traits ? [...rollOptions.traits] : [];
        if (rollOptions.secret) {
            options.traits.push("secret");
            console.log(`Added "secret" trait to options.traits`);
        }

        // Include additional options
        if (typeof rollOptions.skipDialog !== 'undefined') {
            options.skipDialog = rollOptions.skipDialog;
            console.log(`Set options.skipDialog = ${rollOptions.skipDialog}`);
        }
        if (typeof rollOptions.createMessage !== 'undefined') {
            options.createMessage = rollOptions.createMessage;
            console.log(`Set options.createMessage = ${rollOptions.createMessage}`);
        }

        console.log(`Final options object before executing action.use:`, options);

        // **Execute the Action Roll**
        await action.use(options);
        console.log(`Action "${actionSlug}" executed with options:`, options);

        // **Placeholder for Roll Result**
        // Since action.use does not return a roll, we'll return a placeholder.
        // You may need to adjust this based on how PF2e handles action rolls.
        const rollResult = {
            total: actor.system.actions[actionSlug]?.totalModifier || 0, // Adjust according to actual data structure
            outcome: determineOutcome(actor.system.actions[actionSlug]?.totalModifier || 0, difficultyClass), roll: null // Replace with actual Roll object if available
        };

        console.log(`Action roll result for "${actionSlug}":`, rollResult);
        return rollResult;
    } catch (error) {
        console.error(`Error executing action "${actionSlug}":`, error);
        ui.notifications.error(`Failed to execute action "${actionSlug}". See console for details.`);
        return null;
    }
}

/**
 * Determines the outcome of a roll based on the total modifier and DC.
 *
 * @param {number} totalModifier - The total modifier from the roll (including dice and bonuses).
 * @param {number} dc - The Difficulty Class (DC) to compare against.
 * @returns {string} - The outcome of the roll: 'success' or 'failure'.
 */
function determineOutcome(totalModifier, dc) {
    if (totalModifier >= dc) {
        return 'success';
    } else {
        return 'failure';
    }
}

function updateRollResultUI(data) {
    const {
        actorId, result, isBlindRoll
    } = data;
    const {
        degreeOfSuccess, total
    } = result;

    const characterBox = document.querySelector(`.character-box[data-actor-id="${actorId}"]`);
    if (!characterBox) {
        console.warn(`Character box for actor UUID ${actorId} not found.`);
        return;
    }

    const resultArea = characterBox.querySelector('.result-area');
    const indicatorArea = characterBox.querySelector('.indicator-area');

    // Clear previous indicator
    indicatorArea.innerHTML = '';

    // Display the roll result
    resultArea.innerHTML = `<p><strong>Result:</strong> ${isBlindRoll && !game.user.isGM ? '???' : total}</p>`;

    // Create and append the new indicator
    const indicator = createIndicator(isBlindRoll && !game.user.isGM ? '???' : degreeOfSuccess);
    indicatorArea.appendChild(indicator);
}

function registerPersistedSelectionSetting() {
    game.settings.register("pf2e-roll-manager", "persistedSelectedCharacters", {
        name: "Persisted Selected Characters",
        hint: "List of character IDs that are automatically selected for rolls.",
        scope: "world",
        config: false, // Hidden from configuration UI
        type: Array,
        default: [],
        onChange: (value) => {
            console.log(`[${MODULE_NAMESPACE}] Persisted selected characters updated:`, value);
        }
    });
}

/**
 * Extracts the action name from the message flavor by parsing the text within the first <strong> tag.
 * Assumes the flavor is in the format "<strong>Action Name</strong> - Additional Info".
 *
 * @param {string} flavor - The flavor text from the chat message.
 * @returns {string} - The extracted action name in lowercase with hyphens (e.g., 'recall-knowledge'). Returns an empty string if extraction fails.
 */
function extractActionNameFromFlavor(flavor) {
    if (typeof flavor !== 'string') return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = flavor;
    const strongTag = tempDiv.querySelector('strong');
    if (strongTag) {
        // Extract text, convert to lowercase, replace spaces with hyphens for consistency
        return strongTag.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    }
    return '';
}

/**
 * Creates an action button that opens the Roll Manager Dialog with preselected options.
 *
 * @param {string} name - The name of the action to preselect.
 * @param {number} dc - The Difficulty Class to set for the action.
 * @param {string} traits - Any additional traits associated with the action.
 * @returns {jQuery} - The jQuery button element.
 */
function createActionButton(name, dc, traits) {
    // Create a button element with type="button" to prevent it from acting as a submit button
    const button = $('<button type="button" class="action-button custom-button" title="Execute Action"><i class="fas fa-dice"></i></button>');
    button.attr('data-action-name', name);
    button.attr('data-dc', dc);
    button.attr('data-traits', traits);

    // Prevent default behavior and stop event propagation to avoid unintended actions
    button.on('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleActionButtonClick(name, dc, traits);
    });

    return button;
}

// Function to process and replace matched text with buttons
function processElement(element, pattern, type) {
    function processTextNode(textNode) {
        const textContent = textNode.nodeValue;
        let match, lastIndex = 0;
        const parent = textNode.parentNode;
        pattern.lastIndex = 0;
        let currentIndex = 0;
        while ((match = pattern.exec(textContent)) !== null) {
            const fullMatch = match[0];
            let name, dc, traits;
            if (type === 'act') {
                name = match[1];
                dc = match[2];
                traits = '';
            } else if (type === 'check') {
                name = match[1];
                dc = match[2];
                traits = match[3] || '';
            }

            // Text before the match
            const beforeText = textContent.substring(currentIndex, match.index);
            if (beforeText) {
                const beforeTextNode = document.createTextNode(beforeText);
                parent.insertBefore(beforeTextNode, textNode);
            }

            // Matched text
            const matchedTextNode = document.createTextNode(fullMatch);
            parent.insertBefore(matchedTextNode, textNode);

            // Create button
            const buttonElement = document.createElement('button');
            buttonElement.className = 'action-button custom-button';
            buttonElement.title = 'Execute Action';
            buttonElement.setAttribute('data-action-name', name);
            buttonElement.setAttribute('data-dc', dc);
            buttonElement.setAttribute('data-traits', traits);
            buttonElement.innerHTML = '<i class="fas fa-dice"></i>';
            parent.insertBefore(buttonElement, textNode);

            // Attach event listener
            const button = $(buttonElement);
            // Attach the click handler
            button.on('click', () => {
                handleActionButtonClick(name, dc, traits);
            });

            // Update currentIndex and lastIndex
            currentIndex = match.index + fullMatch.length;
            lastIndex = pattern.lastIndex;
        }

        // Text after the last match
        const afterText = textContent.substring(currentIndex);
        if (afterText) {
            const afterTextNode = document.createTextNode(afterText);
            parent.insertBefore(afterTextNode, textNode);
        }

        // Remove original text node
        parent.removeChild(textNode);
    }

    // Traverse child nodes recursively
    function traverse(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (pattern.test(node.nodeValue)) {
                processTextNode(node);
            }
        } else {
            let child = node.firstChild;
            while (child) {
                const nextSibling = child.nextSibling;
                traverse(child);
                child = nextSibling;
            }
        }
    }

    traverse(element);
}

Hooks.once('ready', () => {
    console.log("\n" + "░█████╗░███╗░░██╗██╗░░░██╗  ████████╗███████╗██████╗░██████╗░██╗░░░██╗\n" + "██╔════╝░████╗░██║██║░░░██║  ╚══██╔══╝██╔════╝██╔══██╗██╔══██╗╚██╗░██╔╝\n" + "██║░░██╗░██╔██╗██║██║░░░██║  ░░░██║░░░█████╗░░██████╔╝██████╔╝░╚████╔╝░\n" + "██║░░╚██╗██║╚████║██║░░░██║  ░░░██║░░░██╔══╝░░██╔══██╗██╔══██╗░░╚██╔╝░░\n" + "╚█████╔╝██║░╚███║╚██████╔╝  ░░░██║░░░███████╗██║░░██║██║░░██║░░░██║░░░\n" + "░╚════╝░╚═╝░░╚══╝░╚═════╝░  ░░░╚═╝░░░╚══════╝╚═╝░░╚═╝╚═╝░░╚═╝░░░╚═╝░░░\n" + "\n" + "██████╗░██████╗░████╗░████████╗░████╗░██║░░██║███████╗████████╗████████╗\n" + "██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██║░░██║██╔════╝╚══██╔══╝╚══██╔══╝\n" + "██████╔╝██████╔╝███████║░░░██║░░░██║░░╚═╝███████║█████╗░░░░░██║░░░░░░██║░░░\n" + "██╔    ╗██╔══██╗██╔══██║░░░██║░░░██║░░██╗██╔══██║██╔══╝░░░░░██║░░░░░░██║░░░\n" + "██║░░  ║██║░░██║██║░░██║░░░██║░░░╚█████╔╝██║░░██║███████╗░░░██║░░░░░░██║░░░\n" + "╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚═╝░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝╚══════╝░░░╚═╝░░░░░╚═╝░░░")

    console.log("A person whose name is still spoken isn't dead.")

    saveFoundrySettings();

    gmUserIds = game.users.filter(u => u.isGM).map(u => u.id);
    console.log(`[${MODULE_NAMESPACE}] GM User IDs updated:`, gmUserIds);

    // Register the new setting
    registerPersistedSelectionSetting();


    if (game.user.isGM) {
        // Define the button template for the command palette
        const commandButton = $('<div class="control-icon"><i class="fas fa-dice" title="Open Action Dropdown"></i></div>');
        // Append the button to the command palette
        $('#controls').prepend(commandButton);
        // Add a click event to the button to trigger the createActionDropdown function
        commandButton.on('click', () => {
            createActionDropdown({
                excludeActions: ["administer-first-aid", "create-a-diversion", "perform", "delay"]
            });
        });
    }
});

Hooks.on('getSceneControlButtons', (controls) => {
    let tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
        tokenControls.tools.push({
            name: "pf2eRollManager", title: "PF2E Roll Manager - GM Setup", icon: "fas fa-dice", // Changed to dice icon
            class: "custom-tool-button", // Added custom class
            button: true, onClick: () => {
                createActionDropdown({
                    excludeActions: ["administer-first-aid", "create-a-diversion", "perform", "delay"]
                });
            }
        });
    }
});

Hooks.on('createChatMessage', async (message) => {
    console.log('Chat message:', message);

    // Only process messages with PF2E flags and rolls
    if (message.flags?.pf2e && message.rolls && message.rolls.length > 0) {
        // Extract roll data
        extractRollData(message);
    }
});

Hooks.once("socketlib.ready", () => {
    console.log(`[${MODULE_NAMESPACE}] Socketlib is ready.`);

    try {
        // Register the module with a unique MODULE_NAMESPACE
        socketInstance = socketlib.registerModule(MODULE_NAMESPACE);
        console.log(`[${MODULE_NAMESPACE}] Module '${MODULE_NAMESPACE}' registered successfully.`);

        // Register all socket event listeners
        registerSocketListeners(socketInstance);
    } catch (error) {
        console.error(`[${MODULE_NAMESPACE}] Error during socket registration:`, error);
    }
});

Hooks.on("renderApplication", (app, html) => {
    // Only proceed if the user is a GM
    if (!game.user.isGM) return;

    // Process elements with data-pf2-action attributes
    html.find('[data-pf2-action]').each(function () {
        const element = $(this);
        // Avoid duplicate buttons
        if (element.hasClass('action-button-processed')) return;
        element.addClass('action-button-processed');

        const actionName = element.data('pf2-action');
        const dc = element.data('pf2-dc');
        // Traits might be in data-tooltip or other attributes
        const traits = element.data('tooltip') || element.data('pf2-traits') || '';

        // Create the button
        const button = createActionButton(actionName, dc, traits);

        // Append the button to the right
        element.append('&nbsp;'); // Optional space
        element.append(button);
    });

    // Process elements with data-pf2-check attributes
    html.find('[data-pf2-check]').each(function () {
        const element = $(this);
        // Avoid duplicate buttons
        if (element.hasClass('action-button-processed')) return;
        element.addClass('action-button-processed');

        const actionName = element.data('pf2-check');
        const dc = element.data('pf2-dc');
        const traits = element.data('pf2-traits') || '';

        // Create the button
        const button = createActionButton(actionName, dc, traits);

        // Append the button to the right
        element.append('&nbsp;'); // Optional space
        element.append(button);
    });

    // Optional CSS adjustments
    injectCustomButtonStyles();
});

// Inject custom styles if necessary
function injectCustomButtonStyles() {
    if (!$('head').find(`#${MODULE_NAMESPACE}-custom-style`).length) {
        $('head').append(`
            <style id="${MODULE_NAMESPACE}-custom-style">
                .custom-button {
                    background-color: #f0f0f0;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    width: min-content;
                    padding: 2px 5px;
                    margin-left: 5px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    vertical-align: middle;
                }
                .custom-button:hover {
                    background-color: #e0e0e0;
                }
                .custom-button .fas {
                    color: #000;
                    font-size: 1em;
                }
            </style>
        `);
    }
}
