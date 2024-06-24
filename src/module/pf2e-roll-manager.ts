/// <reference types="@league-of-foundry-developers/foundry-vtt-types" />

import {registerSettings} from './settings';
import {preloadTemplates} from './preloadTemplates';

import {Game, User, Actors} from "@league-of-foundry-developers/foundry-vtt-types";

declare global {
    const game: Game;
}

if (game.user) {
    const user: User = game.user;
    console.log(user.name);
}

if (game.actors) {
    const actors: Actors = game.actors;
    console.log(actors.size);
}


// Initialize module
Hooks.once('init', async () => {
    console.log('pf2e-roll-manager | Initializing pf2e-roll-manager');

    // Register custom module settings
    registerSettings();

    // Preload Handlebars templates
    await preloadTemplates();
});

const namespace = 'module.pf2e-roll-manager';
const skillsAndSaves: string[] = [
    'Perception', 'Acrobatics', 'Arcana', 'Athletics', 'Crafting', 'Deception', 'Diplomacy', 'Intimidation', 'Medicine', 'Nature', 'Occultism', 'Performance', 'Religion', 'Society', 'Stealth', 'Survival', 'Thievery', 'Fortitude Save', 'Reflex Save', 'Will Save'
];

// Define the structure of the data object for type safety
interface SocketData {
    targetUserId: string | null;
    type: string;
    selectedCharacters: string[]; // assuming character IDs are strings
    skillsToRoll: string; // adjust type as needed
    dc: number | null;
    isBlindGM: boolean;
    result: any; // specify the correct type if known
    dialogId: string | null;
    newContent: string | null;
}

// Function to handle received socket data
function processSocketData(data: SocketData) {
    console.log('handleSocketData called with data:', data);

    // Check if the data is intended for the current user
    if (data.targetUserId && data.targetUserId !== game.user.id) {
        console.log('Data not intended for this user. Ignoring.');
        return; // Ignore data not meant for this user
    }

    // Process the received data
    console.log('Received data:', data);

    switch (data.type) {
        case 'updateRollResult':
            refreshCharacterBoxWithRollResult(data);
            break;
        case 'generateCharacterRollBoxes':
            const selectedCharacters = data.selectedCharacters.map(id => game.actors.get(id));
            generateCharacterRollBoxes(selectedCharacters, data.skillsToRoll, data.dc, data.isBlindGM);
            break;
        case 'removeElements':
            removeElements();
            break;
        case 'removeRollText':
            removeRollText();
            break;
        case 'addRollResult':
            // Add the roll result to ResultsManager
            resultsManager.addResult(data.result);
            break;
        default:
            console.log('Unknown data type:', data.type);
    }

    // Add your custom logic here to handle the data
    // For example, you might want to update the UI or perform some action based on the data
    if (data.dialogId && data.newContent) {
        console.log('Updating dialog with ID:', data.dialogId, 'with new content:', data.newContent);
        refreshDialogContent(data.dialogId, data.newContent);
    }
}


// Hooks
// Shared functions and variables
Hooks.once('ready', () => {
    initializeSocketListener();
    saveFoundrySettings();
    logUsersAndAssignedCharacters();
});

Hooks.on('renderApplication', (app: any, html: JQuery<HTMLElement>, data: any) => {
    // Find all inline check elements with the 'with-repost' class
    html.find('a.inline-check.with-repost').each(function () {
        // @ts-ignore
        const skillCheckElement = $(this);
        // Create the button element
        const button = $('<button class="inline-dc-extra-skillbutton"></button>');
        // Create the icon element with the new CSS class
        const icon = $('<i class="fas fa-dice-d20 no-click-through"></i>');
        // Append the icon to the button
        button.append(icon);
        // Append the button to the skill check element
        button.insertAfter(skillCheckElement);
        // Extract the skill type and DC from the inline check button
        const skillType = skillCheckElement.attr('data-pf2-check');
        const dc = parseInt(<string>skillCheckElement.attr('data-pf2-dc'), 10);
        // Add click event listener to the button
        button.on('click', function () {
            const preSelectedSkills = skillType ? [skillType.charAt(0).toUpperCase() + skillType.slice(1)] : [];
            handleDiceButtonClick(preSelectedSkills, dc);
        });
    });
});

Hooks.on('getSceneControlButtons', (controls: any[]) => {
    // Find the existing control for 'token' (or any other existing control you want to add the button to)
    const tokenControl = controls.find(control => control.name === 'token');

    if (tokenControl) {
        tokenControl.tools.push({
            name: 'roll-dice',
            title: 'PF2E Dice Roll Manager',
            icon: 'fas fa-dice-d20',
            button: true,
            onClick: () => handleDiceButtonClick(),
            visible: game.user.isGM // Only visible to GMs
        });
    }
});


interface RollResult {
    character: string;
    skill: string;
    outcome: string;
}

class ResultsManager {
    private results: RollResult[];

    constructor() {
        this.results = [];
    }

    addResult(result: RollResult): void {
        this.results.push(result);
    }

    clearResults(): void {
        this.results = [];
    }

    getResultsSummary(): string {
        return this.results.map(result => {
            return `${result.character}: ${result.skill} - ${result.outcome}`;
        }).join('\n\n'); // Separate each result with two newline characters for clearer separation
    }
}

// Instantiate ResultsManager
const resultsManager = new ResultsManager();


function getSliderColor(dc: number, levelBasedDC: number): string {
    const diff = dc - levelBasedDC;

    // Handle extreme cases (green and red)
    if (diff <= -10) {
        return '#00FF00'; // Green
    } else if (diff >= 10) {
        return '#FF0000'; // Red
    } else {
        // Normalize diff to -10 to 10 range
        const normalizedDiff = diff / 10;

        // Define the orange zone range
        const orangeZone = 0.25;

        // Calculate red and green channels
        let red: number, green: number;

        if (normalizedDiff >= 0) {
            // Transition from orange to red
            red = 255;
            green = Math.round(255 * (1 - Math.min(1, normalizedDiff / orangeZone)));
        } else {
            // Transition from orange to green
            red = Math.round(255 * (1 - Math.min(1, Math.abs(normalizedDiff) / orangeZone)));
            green = 255;
        }

        return `rgb(${red}, ${green}, 0)`;
    }
}

function toggleCheckbox(characterId: string): void {
    const checkbox = document.getElementById(`checkbox-${characterId}`) as HTMLInputElement;
    checkbox.checked = !checkbox.checked;
    const button = document.getElementById(`button-${characterId}`) as HTMLButtonElement;
    if (checkbox.checked) {
        button.classList.add('selected');
    } else {
        button.classList.remove('selected');
    }
}

function handleDiceButtonClick(preSelectedSkills: string[] = [], preSelectedDC: number | null = null): void {
    logUsersAndAssignedCharacters();
    const selectedTokens = canvas.tokens.controlled.map(token => token.actor);
    if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can use this button.");
        return;
    }
    // Fetch all character IDs
    const allCharacterIds = game.actors.contents
        .filter(actor => actor.type === 'character' && actor.hasPlayerOwner)
        .map(actor => actor.id);
    // Render the dialog with all characters pre-selected
    renderRollManagerDialog(selectedTokens, allCharacterIds, preSelectedSkills, preSelectedDC);
}

function renderRollManagerDialog(
    selectedTokens: any[] = [],
    preSelectedCharacterIds: string[] = [],
    preSelectedSkills: string[] = [],
    preSelectedDC: number | null = null
): void {
    // Ensure preSelectedSkills is an array
    if (!Array.isArray(preSelectedSkills)) {
        preSelectedSkills = [];
    }

    const users = game.users.contents.filter(user => !user.isGM);
    const characterLevels: number[] = [];
    let characterSelection = buildCharacterSelection(users, preSelectedCharacterIds, characterLevels);
    const averageLevel = computeAverageCharacterLevel(characterLevels);
    const levelBasedDC = 15 + (averageLevel - 1) * 2;
    const initialDC = preSelectedDC !== null ? preSelectedDC : levelBasedDC;
    const dialogContent = buildDialogContent(preSelectedSkills, initialDC, characterSelection);

    new Dialog({
        title: 'The PF2E Roll Manager',
        content: dialogContent,
        buttons: {
            roll: createRollButton(preSelectedCharacterIds, preSelectedSkills, preSelectedDC, selectedTokens),
            blindRoll: createRollButton(preSelectedCharacterIds, preSelectedSkills, preSelectedDC, selectedTokens, true),
            rollFlat: createFlatCheckButton(preSelectedCharacterIds, preSelectedDC, selectedTokens),
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: 'Cancel'
            }
        },
        default: 'roll',
        render: (html) => {
            setupDialog(html, selectedTokens, initialDC, levelBasedDC);
        }
    }, {width: 620, height: 860}).render(true);
}

function buildCharacterSelection(
    users: User[],
    preSelectedCharacterIds: string[],
    characterLevels: number[]
): string {
    let characterSelection = '<div class="character-selection-grid">';
    const activeScene = game.scenes.active;
    const sceneTokens = activeScene.tokens.contents;

    users.forEach(user => {
        const characters = game.actors.contents.filter(actor => {
            return actor.isOfType('character') && actor.hasPlayerOwner && actor.ownership[user.id] === 3;
        });

        // Filter characters that have a token in the current scene
        const charactersInScene = characters.filter(character => {
            return sceneTokens.some(token => token.actorId === character.id);
        });

        // Filter NPCs that have a token in the current scene and the player owns them
        const npcsInScene = sceneTokens.filter(token => {
            return token.actor.isOfType('npc') && token.actor.hasPlayerOwner && token.actor.ownership[user.id] === 3;
        }).map(token => token.actor);

        const charactersAndNPCsInScene = charactersInScene.concat(npcsInScene);

        if (charactersAndNPCsInScene.length > 0) {
            characterSelection += `<div class="user-column"><strong>${user.name}</strong>`;
            charactersAndNPCsInScene.forEach(character => {
                const tokenTexture = character.prototypeToken.texture.src || '';
                characterSelection += `
                    <div class="character-selection">
                        <input type="checkbox" id="checkbox-${character.id}" name="character" value="${character.id}" style="display: none;" ${preSelectedCharacterIds.includes(character.id) ? 'checked' : ''} />
                        <button class="character-button ${preSelectedCharacterIds.includes(character.id) ? 'selected' : ''}" id="button-${character.id}" data-character-id="${character.id}">
                            <div class="character-name">${character.name}</div>
                            <div class="character-token">
                                <img src="${tokenTexture}" alt="${character.name}" width="50" height="50" />
                            </div>
                        </button>
                    </div>
                `;
                characterLevels.push(character.system.details.level.value);
            });
            characterSelection += `</div>`;
        }
    });
    characterSelection += '</div>';
    return characterSelection;
}


function buildDialogContent(preSelectedSkills: string[], initialDC: number, characterSelection: string): string {
    return `
    <form>
        <!-- Skill/Save Selection Section -->
        <div class="skill-form-group">
            <div class="skill-save-selection flex-container">
                <div class="skill-buttons-grid">
                    ${skillsAndSaves.map(skill => `
                        <button type="button" class="skill-button ${preSelectedSkills.includes(skill) ? 'selected' : ''}" data-skill="${skill}">${skill}</button>
                    `).join('')}
                </div>
            </div>
        </div>
        <!-- DC Adjustment Section -->
        <div class="skill-form-group">
            <div><hr></div>
            <div class="dc-slider-container slider-container">
                <input type="range" id="dc-slider" name="dc" min="1" max="60" value="${initialDC}" />
                <span id="dc-slider-value">${initialDC}</span>
            </div>
        </div>
        <div><hr></div>
        <div class="level-based-dc-buttons flex-container">
            ${buildDcAdjustmentButtons(initialDC)}
        </div>
        <div><hr></div>
        <div class="standard-dc-buttons flex-container">
            ${buildStandardDcButtons()}
        </div>
        <!-- Character Selection Section -->
        <div class="skill-form-group">
            <div><hr></div>
            <div class="character-selection-grid flex-container">
                ${characterSelection}
            </div>
        </div>
        <div><hr></div>
        <!-- Additional Options Section -->
        <div class="additional-options">
        </div>
        <div><hr></div>
        <div class="kofi-donation">
            <label> Want to support this module? Please consider a <a href="https://ko-fi.com/mythicamachina">donation</a> to help pay for development. </label>
            <a href="https://ko-fi.com/mythicamachina">
                <img src="modules/pf2e-roll-manager/assets/kofilogo.png" alt="Ko-Fi Logo" style="height: 25px; border: none;" />
            </a>
        </div>
        <div><hr></div>
    </form>
  `;
}

interface DcAdjustment {
    label: string;
    adjust: number;
}

function buildDcAdjustmentButtons(initialDC: number): string {
    const adjustments: DcAdjustment[] = [
        {label: 'V. Easy -10', adjust: -10},
        {label: 'Easier -5', adjust: -5},
        {label: 'Easy -2', adjust: -2},
        {label: 'Hard +2', adjust: 2},
        {label: 'Harder +5', adjust: 5},
        {label: 'V. Hard +10', adjust: 10}
    ];
    return adjustments.map(adj => `
        <button type="button" class="dc-adjustment" data-adjust="${adj.adjust}">${adj.label}</button>
    `).join('') + `
        <input type="number" class="dc-input-box" id="dc-input" name="dc-input" value="${initialDC}" min="1" max="60" class="dc-input" />
    `;
}

interface StandardDC {
    label: string;
    dc: number;
}

function buildStandardDcButtons(): string {
    const dcs: StandardDC[] = [
        {label: 'Untrained', dc: 10},
        {label: 'Trained', dc: 15},
        {label: 'Expert', dc: 20},
        {label: 'Master', dc: 30},
        {label: 'Legendary', dc: 40},
        {label: 'Mythical', dc: 50}
    ];
    return dcs.map(dc => `
        <button type="button" class="standard-dc" data-dc="${dc.dc}">${dc.label}</button>
    `).join('');
}

interface RollButtonConfig {
    icon: string;
    label: string;
    callback: (html: JQuery<HTMLElement>) => void | boolean;
}

function createRollButton(
    preSelectedCharacterIds: string[],
    preSelectedSkills: string[],
    preSelectedDC: number | null,
    selectedTokens: any[],
    isBlindGM: boolean = false
): RollButtonConfig {
    return {
        icon: `<i class="fas ${isBlindGM ? 'fa-eye' : 'fa-dice-d20'}"></i>`,
        label: isBlindGM ? 'Roll Blind GM' : 'Roll',
        callback: (html: JQuery<HTMLElement>) => {
            const selectedSkills = html.find('.skill-button.selected').map((_, el) => (el as HTMLElement).dataset.skill).get();
            const dc = parseInt(html.find('#dc-input').val() as string, 10);  // Get the updated DC value
            const selectedCharacterIds = html.find('[name="character"]:checked').map((_, el) => (el as HTMLInputElement).value).get();
            if (selectedSkills.length === 0) {
                ui.notifications.warn("Please select at least one skill or save to roll.");
                renderRollManagerDialog(selectedTokens, preSelectedCharacterIds, preSelectedSkills, preSelectedDC); // Reopen the dialog
                return false; // Prevent the dialog from closing
            }
            if (selectedCharacterIds.length === 0) {
                ui.notifications.warn("Please select at least one character to roll.");
                renderRollManagerDialog(selectedTokens, preSelectedCharacterIds, preSelectedSkills, preSelectedDC); // Reopen the dialog
                return false; // Prevent the dialog from closing
            }
            const selectedCharacters = selectedCharacterIds.map(id => game.actors.get(id));
            displayCharacterRollBoxes(selectedCharacters, selectedSkills, dc, isBlindGM);
        }
    };
}

function createFlatCheckButton(
    preSelectedCharacterIds: string[],
    preSelectedDC: number | null,
    selectedTokens: any[]
): RollButtonConfig {
    return {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: 'Flat Check',
        callback: (html: JQuery<HTMLElement>) => {
            const dc = parseInt(html.find('#dc-input').val() as string, 10);  // Get the updated DC value
            const selectedCharacterIds = html.find('[name="character"]:checked').map((_, el) => (el as HTMLInputElement).value).get();
            if (selectedCharacterIds.length === 0) {
                ui.notifications.warn("Please select at least one character to roll.");
                renderRollManagerDialog(selectedTokens, preSelectedCharacterIds, [], preSelectedDC); // Reopen the dialog
                return false; // Prevent the dialog from closing
            }
            console.log(`Performing Flat Check against DC ${dc} for characters: ${selectedCharacterIds.join(', ')}`);
            const selectedCharacters = selectedCharacterIds.map(id => game.actors.get(id));
            displayCharacterRollBoxes(selectedCharacters, ['Flat Check'], dc, false);
        }
    };
}


function setupDialog(
    html: JQuery<HTMLElement>,
    selectedTokens: any[],
    initialDC: number,
    levelBasedDC: number[]
): void {
    html.closest('.dialog').addClass('skill-app'); // Add the custom class here
    selectedTokens.forEach(tokenActor => {
        const checkbox = html.find(`#checkbox-${tokenActor.id}`);
        if (checkbox.length) {
            checkbox.prop('checked', true);
            const button = html.find(`#button-${tokenActor.id}`);
            if (button.length) {
                button.addClass('selected');
            }
        }
    });

    const dcSlider = html.find('#dc-slider');
    const dcSliderValue = html.find('#dc-slider-value');
    dcSlider.on('input', function () {
        const dc = parseInt((this as HTMLInputElement).value, 10);
        const color = getSliderColor(dc, levelBasedDC);
        document.documentElement.style.setProperty('--dc-slider-color', color);
        dcSliderValue.text((this as HTMLInputElement).value);
        html.find('#dc-input').val((this as HTMLInputElement).value);
    });
    const dcInput = html.find('#dc-input');
    dcInput.on('input', function () {
        const newDC = Math.max(1, Math.min(60, parseInt((this as HTMLInputElement).value, 10)));
        const color = getSliderColor(newDC, levelBasedDC);
        document.documentElement.style.setProperty('--dc-slider-color', color);
        dcSlider.val(newDC);
        dcSliderValue.text(newDC);
    });
    html.find('.skill-button').on('click', function () {
        $(this).toggleClass('selected');
    });
    html.find('.character-button').on('click', function () {
        const characterId = $(this).data('character-id');
        toggleCheckbox(characterId);
    });
    html.find('.dc-adjustment').on('click', function () {
        const adjustValue = parseInt($(this).data('adjust'), 10);
        const newDC = Math.max(1, Math.min(60, parseInt(dcSlider.val() as string, 10) + adjustValue));
        const color = getSliderColor(newDC, levelBasedDC);
        document.documentElement.style.setProperty('--dc-slider-color', color);
        dcSlider.val(newDC);
        dcSliderValue.text(newDC);
        dcInput.val(newDC);
    });
    html.find('.standard-dc').on('click', function () {
        const standardDC = parseInt($(this).data('dc'), 10);
        const color = getSliderColor(standardDC, levelBasedDC);
        document.documentElement.style.setProperty('--dc-slider-color', color);
        dcSlider.val(standardDC);
        dcSliderValue.text(standardDC);
        dcInput.val(standardDC);
    });
}

function saveFoundrySettings(): void {
    game.settings.register("pf2e-roll-manager", "diceRollDelay", {
        name: "Dice Roll Delay",
        hint: "This is the amount of time in milliseconds between pressing the button to roll and getting the result - adjust this if the result appears before the dice animation has finished.",
        scope: "world",      // This specifies a world-stored setting
        config: true,        // This indicates that the setting appears in the configuration view
        type: Number,        // The type of the setting data
        default: 3000        // The default value for the setting
    });
    game.settings.register("pf2e-roll-manager", "autoFadeOut", {
        name: "Automatic Fadeout",
        hint: "The amount of time in milliseconds before the interface boxes will automatically fade out once all results have been gathered.",
        scope: "world",      // This specifies a world-stored setting
        config: true,        // This indicates that the setting appears in the configuration view
        type: Boolean,        // The type of the setting data
        default: true        // The default value for the setting
    });
    game.settings.register("pf2e-roll-manager", "timeBeforeFadeOut", {
        name: "Interface Fadeout Delay",
        hint: "The amount of time in milliseconds before the interface boxes will automatically fade out once all results have been gathered.",
        scope: "world",      // This specifies a world-stored setting
        config: true,        // This indicates that the setting appears in the configuration view
        type: Number,        // The type of the setting data
        default: 6000        // The default value for the setting
    });
    game.settings.register("pf2e-roll-manager", "showDCForRoll", {
        name: "Show DC for Rolls",
        hint: "Whether or not the DC should be displayed.",
        scope: "world",      // This specifies a world-stored setting
        config: true,        // This indicates that the setting appears in the configuration view
        type: Boolean,        // The type of the setting data
        default: true        // The default value for the setting
    });
}

function initializeSocketListener(): void {
    console.log('Registering socket listener for namespace:', namespace);
    game.socket.on(namespace, processSocketData);
}

function mapSkillOrSaveNameToKey(skillOrSaveName: string): string {
    const skillMap: { [key: string]: string } = {
        'Perception': 'perception',
        'Acrobatics': 'acr',
        'Arcana': 'arc',
        'Athletics': 'ath',
        'Crafting': 'cra',
        'Deception': 'dec',
        'Diplomacy': 'dip',
        'Intimidation': 'itm',
        'Medicine': 'med',
        'Nature': 'nat',
        'Occultism': 'occ',
        'Performance': 'prf',
        'Religion': 'rel',
        'Society': 'soc',
        'Stealth': 'ste',
        'Survival': 'sur',
        'Thievery': 'thi',
        'Fortitude Save': 'fortitude',
        'Reflex Save': 'reflex',
        'Will Save': 'will'
    };
    return skillMap[skillOrSaveName];
}

function refreshDialogContent(dialogId: string, newContent: string): void {
    console.log('updateDialog called with dialogId:', dialogId, 'and newContent:', newContent);
    // Find the dialog element by ID
    const dialogElement = document.getElementById(dialogId);
    if (!dialogElement) {
        console.warn(`Dialog with ID ${dialogId} does not exist.`);
        return;
    }
    // Find the Dialog instance by its ID
    const dialogInstance = Object.values(ui.windows).find(w => w.id === dialogId);
    if (!dialogInstance) {
        console.warn(`Dialog instance with ID ${dialogId} does not exist.`);
        return;
    }
    // Update the content using the Dialog's render method
    console.log('Updating content of dialog with ID:', dialogId);
    dialogInstance.data.content = `<div id="${dialogId}">${newContent}</div>`;
    dialogInstance.render(true);
}

function logUsersAndAssignedCharacters(): void {
    console.log("PF2E Roll Manager: Checking Characters");

    // Ensure the game data is fully loaded
    if (!game.users || !game.actors || !game.scenes || !game.scenes.active) {
        console.error("Game data is not fully loaded or no active scene.");
        return;
    }

    // Get the active scene
    const activeScene = game.scenes.active;

    // Get all tokens in the active scene
    const sceneTokens = activeScene.tokens.contents;

    // Log all actor names
    const allActorNames = game.actors.contents.map(actor => actor.name);
    console.log("All Actors:", allActorNames);

    // Get all users
    const users = game.users.contents;

    users.forEach(user => {
        console.log(`Checking characters for user: ${user.name}`);

        // Get the characters assigned to the user
        const characters = game.actors.contents.filter(actor => {
            // Check if the actor is of type 'character' and has the correct ownership level
            return actor.type === 'character' && actor.hasPlayerOwner && actor.ownership[user.id] === 3;
        });

        // Filter characters that have a token in the current scene
        const charactersInScene = characters.filter(character => {
            return sceneTokens.some(token => token.actorId === character.id);
        });

        console.log(`Characters assigned to user ${user.name} in the scene:`, charactersInScene.map(character => character.name));

        charactersInScene.forEach(character => {
            // Get the token texture from the prototype token
            const tokenTexture = character.prototypeToken.texture.src;
            if (tokenTexture) {
                console.log(`User: ${user.name}, Character: ${character.name}, Token Texture: ${tokenTexture}`);
            } else {
                console.log(`User: ${user.name}, Character: ${character.name}, Token Texture: Not Set`);
            }
        });
    });
}


async function displayCharacterRollBoxes(
    selectedCharacters: any[],
    skillsToRoll: string[],
    dc: number,
    isBlindGM: boolean
): Promise<void> {
    // Broadcast the creation event to all clients
    game.socket.emit(namespace, {
        type: 'generateCharacterRollBoxes',
        selectedCharacters: selectedCharacters.map(character => character.id),
        skillsToRoll,
        dc,
        isBlindGM
    });
    // Create the character boxes for the GM
    await generateCharacterRollBoxes(selectedCharacters, skillsToRoll, dc, isBlindGM);
}

interface Skill {
    modifiers?: { modifier: number }[];
    totalModifier?: number;
    value?: number;
}

interface Character {
    id: string;
    system: {
        saves: { [key: string]: Skill };
        perception: Skill;
        skills: { [key: string]: Skill };
    };
    hasPlayerOwner: boolean;
    data: {
        permission: { [key: string]: number };
    };
}

function getSkillModifier(character: Character, skillKey: string): number {
    let totalModifier = 0;
    let skill: Skill | undefined;

    // Check if the skillKey is a save, perception, or a regular skill
    if (['fortitude', 'reflex', 'will'].includes(skillKey)) {
        // Access the save skill
        skill = character.system.saves[skillKey];
    } else if (skillKey === 'perception') {
        // Access perception skill (assuming it has a similar structure to skills)
        skill = character.system.perception;
    } else {
        // Access the regular skill
        skill = character.system.skills[skillKey];
    }

    // If the skill or save exists, sum up the modifiers
    if (skill) {
        if (skill.modifiers) {
            // Sum up the modifiers if they exist
            totalModifier = skill.modifiers.reduce((total, modifier) => total + modifier.modifier, 0);
        } else {
            // Use the totalModifier attribute if it exists or fallback to value
            totalModifier = skill.totalModifier || skill.value || 0;
        }
    }

    return totalModifier;
}

function computeAverageCharacterLevel(levels: number[]): number {
    // Ensure levels is an array of numbers
    if (!Array.isArray(levels) || levels.length === 0) {
        return 1;
    }

    levels = levels.filter(level => typeof level === 'number' && !isNaN(level));

    if (levels.length === 0) {
        return 1;
    }

    levels.sort((a, b) => a - b);
    const trimCount = Math.floor(levels.length * 0.1);
    const trimmedLevels = levels.slice(trimCount, levels.length - trimCount);
    const total = trimmedLevels.reduce((sum, level) => sum + level, 0);
    return Math.round(total / trimmedLevels.length);
}

async function checkCharacterOwnershipPermissions(character: Character): Promise<boolean> {
    // Ensure the game data is fully loaded
    if (!game.users || !game.actors) {
        console.error("Game data is not fully loaded.");
        return false;
    }

    // Get the current user
    const currentUser = game.user;
    if (!currentUser) {
        console.error("User not found.");
        return false;
    }

    // Check if the current user is the Game Master
    if (currentUser.isGM) {
        return true; // GM always has permissions
    }

    // Check if the character is assigned to the current user
    const assignedCharacters = currentUser.character ? [currentUser.character] : [];
    if (!assignedCharacters.includes(character)) {
        console.error("Character is not assigned to the current user.");
        return false;
    }

    // Check if the character has the correct ownership level
    return character.hasPlayerOwner && character.data.permission[game.user._id] === 3;
}

function createOverlay(): HTMLDivElement {
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

function createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'character-box-container';
    container.classList.add('interactive-overlay');
    container.style.position = 'fixed';
    container.style.top = '30%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.zIndex = '99';
    return container;
}


async function createHeadingWithDC(skillsToRoll: string[], dc: number, isBlindGM: boolean): Promise<HTMLHeadingElement> {
    // Use showDCForRoll parameter to decide whether to include DC in heading text
    let formattedSkills: string;
    if (skillsToRoll.length === 1) {
        formattedSkills = skillsToRoll[0];
    } else if (skillsToRoll.length === 2) {
        formattedSkills = `${skillsToRoll[0]} or ${skillsToRoll[1]}`;
    } else if (skillsToRoll.length === 3) {
        formattedSkills = `${skillsToRoll[0]}, ${skillsToRoll[1]} or ${skillsToRoll[2]}`;
    } else {
        formattedSkills = skillsToRoll.join(', '); // For more than 3 skills, if needed.
    }

    const showDCForRoll = await game.settings.get('pf2e-roll-manager', 'showDCForRoll') && !isBlindGM;

    const heading = document.createElement('h1');
    if (showDCForRoll === true) {
        heading.textContent = `The GM would like you to attempt a roll: ${formattedSkills} - DC: ${dc}`;
    } else {
        heading.textContent = `The GM would like you to attempt a roll: ${formattedSkills}`;
    }

    heading.style.color = 'white';
    heading.style.fontFamily = 'Arial, sans-serif';
    heading.style.fontSize = '2em';
    heading.style.marginBottom = '20px';
    return heading;
}

async function createHeadingWrapper(skillsToRoll: string[], dc: number, isBlindGM: boolean): Promise<HTMLHeadingElement> {
    return await createHeadingWithDC(skillsToRoll, dc, isBlindGM);
}

function createCharacterBox(
    character: Character,
    skillsToRoll: string[],
    dc: number,
    isBlindGM: boolean,
    index: number,
    characterBoxes: { box: HTMLDivElement; rolled: boolean }[],
    resultsSummary: string[]
): HTMLDivElement {
    const box = document.createElement('div');
    box.className = 'character-box fade-in';
    box.dataset.actorId = character.id;
    box.style.margin = '10px';
    box.style.padding = '20px';
    box.style.backgroundColor = 'white';
    box.style.border = '1px solid black';
    box.style.borderRadius = '10px';
    box.style.textAlign = 'center';

    const characterNameHeading = document.createElement('h2');
    characterNameHeading.textContent = character.name;
    characterNameHeading.style.fontFamily = 'Arial, sans-serif';
    characterNameHeading.style.fontSize = '1.7em';
    characterNameHeading.style.marginBottom = '10px';
    box.appendChild(characterNameHeading);

    const tokenImage = document.createElement('img');
    tokenImage.src = character.prototypeToken.texture.src;
    tokenImage.alt = character.name;
    tokenImage.style.width = '150px';
    tokenImage.style.height = '150px';
    tokenImage.style.display = 'block';
    tokenImage.style.margin = '0 auto';
    tokenImage.style.border = '0';
    tokenImage.style.padding = '10px';
    box.appendChild(tokenImage);

    const skillSelect = document.createElement('select');
    skillsToRoll.forEach(skill => {
        if (skill) {
            const option = document.createElement('option');
            const skillKey = mapSkillOrSaveNameToKey(skill);
            const skillModifier = getSkillModifier(character, skillKey);
            option.value = skill;
            option.textContent = `${skill} (${skillModifier >= 0 ? '+' : ''}${skillModifier})`;
            skillSelect.appendChild(option);
        }
    });
    box.appendChild(skillSelect);

    let rollButton: HTMLButtonElement | undefined;
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
    }, 500 + index * 200);

    if (rollButton) {
        addRollButtonEventListener(rollButton, character, skillSelect, box, dc, characterBoxes, resultsSummary);
    }
    addRollBlindButtonEventListener(rollBlindButton, character, skillSelect, box, dc, characterBoxes, resultsSummary);

    return box;
}

function addRollButtonEventListener(
    rollButton: HTMLButtonElement,
    character: Character,
    skillSelect: HTMLSelectElement,
    box: HTMLDivElement,
    dc: number,
    characterBoxes: { box: HTMLDivElement; rolled: boolean }[],
    resultsSummary: string[]
): void {
    rollButton.addEventListener('click', async () => {
        const selectedSkill = skillSelect.value;
        const resultArea = box.querySelector('.result-area') as HTMLDivElement;
        const indicatorArea = box.querySelector('.indicator-area') as HTMLDivElement;

        const hasPermission = await checkCharacterOwnershipPermissions(character);

        if (!hasPermission) {
            resultArea.textContent = "You don't own this character.";
            return;
        }

        resultArea.textContent = "Rolling...";
        setTimeout(async () => {
            let result;
            if (selectedSkill === 'Flat Check') {
                result = await performFlatCheck(character, dc, false);
            } else {
                const skillKey = mapSkillOrSaveNameToKey(selectedSkill);
                result = await performSkillOrSaveCheck(skillKey, character, dc, false);
            }
            if (result) {
                displayRollResult(result, resultArea, indicatorArea, character, selectedSkill, characterBoxes, resultsSummary, box);
            }
        }, 100);
    });
}

function addRollBlindButtonEventListener(
    rollBlindButton: HTMLButtonElement,
    character: Character,
    skillSelect: HTMLSelectElement,
    box: HTMLDivElement,
    dc: number,
    characterBoxes: { box: HTMLDivElement; rolled: boolean }[],
    resultsSummary: string[]
): void {
    rollBlindButton.addEventListener('click', async () => {
        const selectedSkill = skillSelect.value;
        const resultArea = box.querySelector('.result-area') as HTMLDivElement;
        const indicatorArea = box.querySelector('.indicator-area') as HTMLDivElement;

        const hasPermission = await checkCharacterOwnershipPermissions(character);

        if (!hasPermission) {
            resultArea.textContent = "You don't own this character.";
            return;
        }

        let result;
        if (selectedSkill === 'Flat Check') {
            result = await performFlatCheck(character, dc, true);
        } else {
            const skillKey = mapSkillOrSaveNameToKey(selectedSkill);
            result = await performSkillOrSaveCheck(skillKey, character, dc, true);
        }
        if (result) {
            resultArea.textContent = `Result: ???`;
            indicatorArea.innerHTML = '';
            const indicator = document.createElement('span');
            indicator.textContent = "???";
            indicatorArea.appendChild(indicator);
            resultsSummary.push(`${character.name}: ${selectedSkill} - ???`);
        }
        resultsManager.addResult({
            character: character.name,
            skill: selectedSkill,
            outcome: "???",
        });
    });
}

async function displayRollResult(
    result: { total: number; degreeOfSuccess: string },
    resultArea: HTMLDivElement,
    indicatorArea: HTMLDivElement,
    character: Character,
    selectedSkill: string,
    characterBoxes: { box: HTMLDivElement; rolled: boolean }[],
    resultsSummary: string[],
    box: HTMLDivElement
): Promise<void> {
    const {total, degreeOfSuccess} = result;

    // Update result area
    resultArea.textContent = `Result: ${total}`;

    // Clear previous indicators
    indicatorArea.innerHTML = '';

    // Create and append new indicator
    const indicator = createIndicator(degreeOfSuccess);
    indicatorArea.appendChild(indicator);

    // Update results summary
    resultsSummary.push(`${character.name}: ${selectedSkill} - ${indicator.textContent}`);

    // Mark character as having rolled
    characterBoxes.find(item => item.box === box)!.rolled = true;

    // Check if all characters have rolled, then remove elements
    if (characterBoxes.every(item => item.rolled)) {
        // Retrieve the autoFadeOut setting
        const autoFadeOut = await game.settings.get('pf2e-roll-manager', 'autoFadeOut');

        // If autoFadeOut is enabled, proceed with automatic fadeout
        if (autoFadeOut) {
            // Retrieve the timeBeforeFadeOut setting or use a default value of 6000 milliseconds (6 seconds)
            const fadeOut = await game.settings.get('pf2e-roll-manager', 'timeBeforeFadeOut') || 6000;

            // Schedule the automatic fadeout
            setTimeout(() => {
                removeElements();
                sendResultsToGM();
            }, fadeOut);
        }
    }
}


function createIndicator(degreeOfSuccess: number): HTMLSpanElement {
    const indicator = document.createElement('span');
    switch (degreeOfSuccess) {
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
            indicator.textContent = "Unknown";
            indicator.style.color = 'black';
            break;
    }
    return indicator;
}

function createExitButton(): HTMLButtonElement {
    const exitButton = document.createElement('button');
    exitButton.textContent = 'Exit';
    exitButton.className = 'exit-button';
    exitButton.style.display = 'block';
    exitButton.style.width = '90px';
    exitButton.style.margin = '20px auto';
    exitButton.style.zIndex = '9999';

    exitButton.addEventListener('click', () => {
        setTimeout(() => {
            removeElements();
            sendResultsToGM();
        }, 1000);
    });

    return exitButton;
}

function sendResultsToGM(): void {
    const gmUser = game.user;
    if (gmUser && gmUser.isGM && gmUser.role >= CONST.USER_ROLES.GAMEMASTER) {
        const resultSummaries: string[] = [];
        const characterBoxes = document.querySelectorAll('.character-box');
        characterBoxes.forEach((characterBox: Element) => {
            const characterName = characterBox.querySelector('h2')?.textContent || 'Unknown';
            const resultArea = characterBox.querySelector('.result-area');
            const skillOrSaveKey = (characterBox.querySelector('select') as HTMLSelectElement)?.value || 'Unknown';
            const indicatorArea = characterBox.querySelector('.indicator-area');
            const indicator = indicatorArea?.textContent?.trim() || 'Unknown';
            let degreeOfSuccess: string;
            if (indicator.startsWith('✅ Critical Success ✅')) {
                degreeOfSuccess = "Critical Success";
            } else if (indicator.startsWith('Success ✅')) {
                degreeOfSuccess = "Success";
            } else if (indicator.startsWith('Failure ❌')) {
                degreeOfSuccess = "Failure";
            } else if (indicator.startsWith('❌ Critical Failure ❌')) {
                degreeOfSuccess = "Critical Failure";
            } else {
                degreeOfSuccess = "Unknown";
            }
            resultSummaries.push(`${characterName} - ${skillOrSaveKey}: ${indicator}`);
        });
        const summaryText = resultSummaries.join("<br>");
        ChatMessage.create({
            user: game.user?._id,
            content: summaryText,
            whisper: [gmUser?._id],
        });
    }
}

async function generateCharacterRollBoxes(selectedCharacters: any[], skillsToRoll: string[], dc: number, isBlindGM: boolean): Promise<void> {
    const overlay = createOverlay();
    const container = createContainer();
    const heading = await createHeadingWrapper(skillsToRoll, dc, isBlindGM); // Await the promise
    container.appendChild(heading);

    const boxesContainer = document.createElement('div');
    boxesContainer.style.display = 'flex';
    boxesContainer.style.flexWrap = 'wrap';
    boxesContainer.style.justifyContent = 'center';
    container.appendChild(boxesContainer);

    let characterBoxes: { box: HTMLDivElement; rolled: boolean }[] = [];
    let resultsSummary: string[] = [];

    selectedCharacters.forEach((character, index) => {
        const box = createCharacterBox(character, skillsToRoll, dc, isBlindGM, index, characterBoxes, resultsSummary);
        boxesContainer.appendChild(box);
        characterBoxes.push({box, rolled: false});
    });

    const exitButton = createExitButton();
    container.appendChild(exitButton);
    document.body.appendChild(container);
}


function refreshCharacterBoxWithRollResult(data: {
    actorId?: any;
    skillOrSaveKey?: any;
    dc: any;
    result: any;
}): void {
    const {actorId, skillOrSaveKey, dc, result} = data;
    const {degreeOfSuccess, total, diceResults, isBlindGM, isSecret, isRolling} = result;
    const characterBox = document.querySelector(`.character-box[data-actor-id="${actorId}"]`) as HTMLDivElement | null;

    if (!characterBox) {
        console.warn(`Character box for actor ID ${actorId} not found.`);
        return;
    }

    const resultArea = characterBox.querySelector('.result-area') as HTMLDivElement;
    const indicatorArea = characterBox.querySelector('.indicator-area') as HTMLDivElement;

    // Clear previous indicator
    indicatorArea.innerHTML = '';

    // Display rolling message if rolling
    if (isRolling) {
        resultArea.textContent = 'Result: Rolling...';
        return;
    }

    setTimeout(() => {
        const showResult = !(isBlindGM || isSecret) || (game.user && game.user.isGM);

        if (!showResult) {
            resultArea.textContent = `Result: ???`;
            indicatorArea.textContent = "???";
        } else {
            const diceResultsText = diceResults?.join(', ') ?? 'Unknown';
            resultArea.textContent = `Result: ${total}`;

            switch (degreeOfSuccess) {
                case 3: // Critical Success
                    indicatorArea.innerHTML = `<span style="color: green">✅ Critical Success ✅</span>`;
                    break;
                case 2: // Success
                    indicatorArea.innerHTML = `<span style="color: green">Success ✅</span>`;
                    break;
                case 1: // Failure
                    indicatorArea.innerHTML = `<span style="color: red">Failure ❌</span>`;
                    break;
                case 0: // Critical Failure
                    indicatorArea.innerHTML = `<span style="color: red">❌ Critical Failure ❌</span>`;
                    break;
                default:
                    indicatorArea.textContent = "Unknown";
                    break;
            }
        }
    }, 1000);
}

function fadeOutAndRemoveElement(element: Element | null, delay: number): void {
    if (element) {
        element.classList.remove('visible');
        element.classList.add('fade-out');
        setTimeout(() => {
            element.remove();
        }, delay);
    }
}

function removeElements(): void {
    const fadeOutDelay = 2000; // Set a uniform fade-out duration

    // Remove character boxes
    const characterBoxes = document.querySelectorAll('.character-box');
    characterBoxes.forEach(box => fadeOutAndRemoveElement(box, fadeOutDelay));

    // Remove exit button
    const exitButton = document.querySelector('.exit-button');
    if (exitButton) {
        exitButton.remove();
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
    }
}

async function performFlatCheck(actor: { id: any }, dc: number, isBlindGM: boolean): Promise<any> {
    // Perform a flat check roll using Foundry's built-in rolling mechanism
    const roll = new Roll('1d20');
    await roll.evaluate({async: true});

    // Create a chat message for the roll
    const rollMode = isBlindGM ? CONST.DICE_ROLL_MODES.BLIND : CONST.DICE_ROLL_MODES.PUBLIC;
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({actor}),
        flavor: `Flat Check (DC ${dc})`,
        rollMode: rollMode,
    });

    // Ensure total is defined before accessing it
    if (roll.total === undefined) {
        throw new Error('Roll total is undefined');
    }

    const total = roll.total;
    const diceResults = roll.dice[0].results.map((r) => r.result);

    // Get the delay value from settings
    let diceRollDelayValue = game.settings.get('pf2e-roll-manager', 'diceRollDelay');

    // Determine the degree of success
    let degreeOfSuccess;
    if (total >= dc + 30) {
        degreeOfSuccess = 3; // Critical Success
    } else if (total >= dc) {
        degreeOfSuccess = 2; // Success
    } else if (total <= dc - 30) {
        degreeOfSuccess = 0; // Critical Failure
    } else {
        degreeOfSuccess = 1; // Failure
    }

    // Delay before broadcasting the result
    await new Promise((resolve) => setTimeout(resolve, diceRollDelayValue));

    // Broadcast the result to all users
    game.socket.emit(namespace, {
        type: 'updateRollResult',
        actorId: actor.id,
        skillOrSaveKey: 'Flat Check',
        dc,
        result: {
            degreeOfSuccess,
            total,
            diceResults,
            isBlindGM,
            isSecret: false, // Flat checks are not secret
        },
    });

    // Return the result along with the degree of success and dice results
    return {degreeOfSuccess, total, diceResults, isSecret: false};
}


async function performSkillOrSaveCheck(skillOrSaveKey: string, actor: any, dc: number, isBlindGM: boolean): Promise<any> {
    console.log('Starting skill or save check:', skillOrSaveKey);

    // Broadcast the initial "Rolling..." message to all users
    game.socket.emit(namespace, {
        type: 'updateRollResult',
        actorId: actor.id,
        skillOrSaveKey,
        dc,
        result: {
            isRolling: true, // Indicate that the roll is in progress
        },
    });

    if (skillOrSaveKey === 'Flat Check') {
        return performFlatCheck(actor, dc, isBlindGM);
    }

    let check;

    if (['fortitude', 'reflex', 'will'].includes(skillOrSaveKey)) {
        check = actor.system.saves[skillOrSaveKey];
    } else if (skillOrSaveKey === 'perception') {
        // For perception, fetch the modifier from actor's data
        const perceptionModifier = actor.system.perception.totalModifier;

        // Create a default check object
        check = {
            label: 'Perception',
            modifiers: [{label: 'Perception', modifier: perceptionModifier || 0, type: 'untyped'}],
        };
    } else {
        check = actor.system.skills[skillOrSaveKey];
    }

    // If the check is undefined, set a default value with a modifier of 0
    if (!check) {
        check = {label: skillOrSaveKey, modifiers: [{label: skillOrSaveKey, modifier: 0, type: 'untyped'}]};
    }

    let modifiers = check.modifiers.map((mod) => {
        return new game.pf2e.Modifier({
            label: mod.label || check.label,
            modifier: mod.modifier || mod.value || 0, // Default to 0 if modifier or value is undefined
            type: mod.type || 'untyped',
        });
    });

    const checkModifier = new game.pf2e.CheckModifier(check.label, {modifiers});

    try {
        console.log('Preparing to roll the check...');

        let rollMode = 'publicroll'; // Default roll mode

        if (isBlindGM) {
            // For Blind GM rolls, specify the roll to be blind
            rollMode = 'blindroll';
        }

        const result = await game.pf2e.Check.roll(checkModifier, {
            actor: actor,
            type: 'skill-check',
            createMessage: true, // Create a chat message
            skipDialog: false, // Show dialog for players
            dc: {value: dc},
            rollMode: rollMode, // Set the correct roll mode
        });

        let diceRollDelayValue = game.settings.get('pf2e-roll-manager', 'diceRollDelay');

        // Simulate a delay after the dice rolling animation completes (adjust timing as needed)
        await new Promise((resolve) => setTimeout(resolve, diceRollDelayValue)); // Adjust the delay time as needed (3 seconds in this example)

        // Extracting relevant data from the result object
        const {degreeOfSuccess, total, diceResults} = result;

        // Check if the roll has the 'secret' trait
        const isSecret = Array.isArray(result.traits) && result.traits.includes('secret');

        // Add the rolled result to the ResultsManager
        resultsManager.addResult(result);

        // Broadcast the result to all users
        game.socket.emit(namespace, {
            type: 'updateRollResult',
            actorId: actor.id,
            skillOrSaveKey,
            dc,
            result: {
                degreeOfSuccess,
                total,
                diceResults,
                isBlindGM, // Include the blind GM flag
                isSecret, // Include the secret trait flag
            },
        });

        // Return the result along with the degree of success, dice results, and secret trait flag
        return {...result, degreeOfSuccess, total, diceResults, isSecret};
    } catch (error) {
        console.error('Error rolling check:', error);
    }
}
