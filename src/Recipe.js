import React, {Component} from 'react';
import {Form, FormControl, Dropdown} from 'react-bootstrap';
import annyang from 'annyang';
import numerizer from 'numerizer';
import TextareaAutosize from 'react-textarea-autosize';

import './stylesheets/Recipe.css';

const sleep = ms => new Promise(
    resolve => setTimeout(resolve, ms)
);

const READING_INGREDIENTS = 0;
const READING_INSTRUCTIONS = 1;
const READING_SPECIFIC_INSTRUCTION = 2;

const RECIPE_STRUCT =
{
    title: "",
    rawIngredients: "",
    rawInstructions: "",
    ingredientsList: [],
    instructionsList: [],
    currentlyReadingIngredientLine: 0,
    currentlyReadingInstructionLine: 0,
    currentlyReadingSubInstructionLine: 0,
    currentlyReadingSpecificSubInstructionLine: 0, //For repeating a specific step
    lastSpoken: "",
    lastStepSpoken: "",
    readingState: 0,
    repeatingSpecificStep: -1,
};
const IS_TEST_ENVIRONMENT = window['speechSynthesis'] == null;

//UI TODO//
//TODO: Prevent adding multiple recipes with the same name and set limit for recipe title
//TODO: Add user notice when trying to save a recipe with a title that's already in use
//TODO: Add a "cooking this" feature to check off which recipes are currently being made. That way switching between recipes will only take those into account.
//TODO: Changing recipes when current recipe has been edited should display prompt to save and then if not, wipe changes
//TODO: Prevent starting reading recipe without a recipe title
//TODO: When clicking save, the step numbers should automatically be remoevd and readded to the input box also to be in-line with what the bot says
//TODO: Voice choice
//TODO: Command list help button

//Backend TODO//
//TODO: Timer functionality ("set a timer for X", "(how much) time (is left) on the timer", "stop timer"). Should be able to set multiple and give each a name (and ofc recipe title should be factored in).


class Recipe extends Component
{
    constructor(props)
    {
        super(props);
        // localStorage.recipes = "[]";

        var utterance = null;
        if(!IS_TEST_ENVIRONMENT)
        {
            utterance = new SpeechSynthesisUtterance();
            let voices = window.speechSynthesis.getVoices();
            utterance.voice = voices[1]; //Nicer male voice
        }

        this.state =
        {
            titleInput: "",
            ingredientsInput: "",
            instructionsInput: "",
            recipes: ("recipes" in localStorage) ? JSON.parse(localStorage.recipes) : [],
            currentRecipe: -1,
            debugLog: true,

            //Voice and Mic
            annyangStarted: false,
            utterance: utterance,
            paused: false,
            waitingForNext: false,
            stepByStep: false,
            speakingId: 0,
        };
    }

    async setStateAndWait(newState)
    {
        return new Promise(resolve => this.setState(newState, resolve));
    }

    debugLog()
    {
        return this.state.debugLog;
    }


    //Recipe Creation Util//

    getCurrentRecipe()
    {
        return this.state.recipes[this.state.currentRecipe];
    }

    getCurrentAudibleStep()
    {
        return this.getCurrentRecipe().currentlyReadingInstructionLine + 1;
    }

    getRepeatedAudibleSpecificStep()
    {
        return this.getCurrentRecipe().repeatingSpecificStep + 1;
    }

    wipeRecipe()
    {
        this.stopTalking();

        this.setState
        ({
            titleInput: "",
            ingredientsInput: "",
            instructionsInput: "",
            currentRecipe: -1,
            paused: false,
            waitingForNext: false,
        }); 
    }

    async changeToRecipe(recipeId)
    {
        this.stopTalking();

        await this.setStateAndWait
        ({
            titleInput: this.state.recipes[recipeId].title,
            ingredientsInput: this.state.recipes[recipeId].rawIngredients,
            instructionsInput: this.state.recipes[recipeId].rawInstructions,
            currentRecipe: recipeId,
            paused: false,
            waitingForNext: false,
        });
    }

    async updateCurrentRecipe(newObj, wait=false)
    {
        var currentRecipe = this.getCurrentRecipe();
        if (currentRecipe == null)
            return;

        var recipeList = this.state.recipes;

        for (let key of Object.keys(newObj))
            currentRecipe[key] = newObj[key];

        recipeList[this.state.currentRecipe] = currentRecipe;

        if (wait)
            await this.setStateAndWait({recipes: recipeList});
        else
            this.setState({recipes: recipeList});
    }

    async updateCurrentRecipeAndWait(newObj)
    {
        await this.updateCurrentRecipe(newObj, true);
    }

    async processTitle()
    {
        if (this.state.titleInput.length > 0)
            await this.updateCurrentRecipeAndWait({title: this.state.titleInput});
    }

    async processIngredients()
    {
        if (this.state.ingredientsInput.length > 0)
        {
            var ingredients = this.state.ingredientsInput
                                .replace(/^\s*-*•*\s*/gm, '') //Remove leading dashes and dots
                                .replace(/(^[ \t]*\n)/gm, "").trim(); //Remove blank lines
            var ingredientsList = ingredients.toLowerCase().split("\n");
            await this.updateCurrentRecipeAndWait({ingredientsList: ingredientsList, rawIngredients: this.state.ingredientsInput.trim()});
        }
    }

    async processInstructions()
    {
        if (this.state.instructionsInput.length > 0)
        {
            var instructions = this.state.instructionsInput.replace(/(^[ \t]*\n)/gm, "").trim(); //Remove blank lines
            var instructionsList = instructions.toLowerCase().split("\n");
            var instructionNumberRegex = /^(Step|Part|Instruction)?\s*[0-9]+\s?[.|\-|)]*\s*/; //Matches characters like "1.", "2)", "3-", etc.

            for (let i = 0; i < instructionsList.length; ++i)
            {
                let instruction = instructionsList[i];

                //Remove the leading number from the instruction if present
                if (instruction.match(instructionNumberRegex))
                    instruction = instruction.replace(instructionNumberRegex, "");

                //Add | to indicate pauses after adding specific ingredients
                let multiIngredientRegex = /<.+>,?.*\sand\s<.+>/g;
                instruction = instruction.replace(multiIngredientRegex,
                    match => match.replace(/,\s?/g, "|").replaceAll(/(?<!<)[ ]and(?![^<]*>)[ ]/g, "|and")); //Replaces all "," and whitespace before the and with a "|"

                //Replace marked ingredients with the actual raw ingredient (premium feature)
                let ingredients = instruction.match(/<(.*?)>/g);
                if (ingredients)
                {
                    for (let j = 0; j < ingredients.length; ++j)
                    {
                        let ingredient = ingredients[j].replace(/[<>]/g, "");
                        let amount = this.howMuchIngredient(ingredient);
                        instruction = instruction.replace(ingredients[j], amount);
                    }
                }

                //Splitting at the period allows the bot to read sentence by sentence
                let subInstructionList = instruction.split(/[.||]/); //Split on "." and "|"
                subInstructionList = subInstructionList.map(string => string.trim());

                if (subInstructionList.at(-1).length === 0)
                    subInstructionList.pop(); //Remove blank entries at end of list

                instructionsList[i] = subInstructionList;
            }

            await this.updateCurrentRecipeAndWait({instructionsList: instructionsList, rawInstructions: this.state.instructionsInput.trim()});
        }
    }

    async saveRecipe()
    {
        var recipes;

        //Try adding a new recipe if this is brand new
        if (this.state.currentRecipe === -1) //Brand new recipe
        {
            recipes = this.state.recipes;
            recipes.push(Object.assign({}, RECIPE_STRUCT));
            
            for (let recipe of recipes)
            {
                if (recipe.title.toLowerCase() === this.state.titleInput)
                {
                    if (this.debugLog())
                        console.log(`A recipe named "${this.state.titleInput}" already exists! Cancelling saving.`);
                    //TODO: Add user notice
                    return;
                }
            }

            await this.setStateAndWait
            ({
                recipes: recipes,
                currentRecipe: recipes.length - 1, //Set to last element in list
            });
        }

        //Convert the input into actual data arrays
        await this.processTitle();
        await this.processIngredients();
        await this.processInstructions();

        //Update the recipe list
        recipes = [];
        for (let recipe of this.state.recipes)
        {
            let savedRecipe = Object.assign({}, RECIPE_STRUCT); //Copy blank object so position in recipe reading is wiped
            savedRecipe.title = recipe.title;
            savedRecipe.rawIngredients = recipe.rawIngredients;
            savedRecipe.rawInstructions = recipe.rawInstructions;
            recipes.push(savedRecipe);
        }
        localStorage.recipes = JSON.stringify(recipes);
    }


    //Microphone Util//

    tryStartAnnyang()
    {
        if (annyang)
        {
            if (this.state.annyangStarted)
            {
                if (this.debugLog())
                    console.log("Annyang already running");
            }
            else
            {
                if (this.debugLog())
                    console.log("Starting Annyang");

                //Define commands
                const commands =
                {
                    //Generic
                    "hello":   () => this.sayText("Hello, I am a recipe bot. But you can call me Recibot."),
                    "recibot": () => this.sayText("What can I help with?"),

                    //Voice Control
                    "slowly":  this.toggleStepByStep.bind(this, true),
                    "slower":  this.toggleStepByStep.bind(this, true),
                    "flower":  this.toggleStepByStep.bind(this, true), //Can be heard instead of "slower"
                    "lower":   this.toggleStepByStep.bind(this, true), //Can be heard instead of "slower"
                    "faster":  this.toggleStepByStep.bind(this, false),
                    "pause":   this.pauseTalking.bind(this),
                    "resume":  this.resumeTalking.bind(this),
                    "stop":    this.stopTalking.bind(this),
                    "shop":    this.stopTalking.bind(this), //Commonly heard instead of "stop"
                    "disable": this.disableAnnyang.bind(this),
                    "repeat":  this.repeatLastSpoken.bind(this),

                    //Ingredients Commands
                    "continue (reading) ingredient(s)":     this.readIngredients.bind(this),
                    "(read) (list) ingredient(s)":          this.readIngredientListFromScratch.bind(this),
                    "how much *ingredient": (ingredient) => this.repeatSpecificIngredient(ingredient),
                    "how many *ingredient": (ingredient) => this.repeatSpecificIngredient(ingredient),

                    //Instructions Commands
                    "continue (reading) instruction(s)":    this.readInstructions.bind(this),
                    "continue repeating step(s)":           this.continueRepeatingSpecificStep.bind(this),
                    "(read) (list) instruction(s)":         this.readInstructionListFromScratch.bind(this),
                    "repeat last step":                     this.repeatLastStep.bind(this),
                    "read from step *number":   (number) => this.readInstructionListFromStep(number),
                    "read step *number":        (number) => this.repeatSpecificStepFromScratch(number),
                    "repeat step *number":      (number) => this.repeatSpecificStepFromScratch(number),

                    //Instructions Queries
                    "which step has (the word) *details": (details) => this.findSpecificStepWith(details),
                    "which step am i on": this.whichStepIsCurrent.bind(this),
                    "current step":       this.whichStepIsCurrent.bind(this),
 
                    //Recipe Queries
                    "which recipe (am i cooking)":    this.sayCurrentRecipe.bind(this), //NEED TESTING//
                    "what's cooking":                 this.sayCurrentRecipe.bind(this), //NEED TESTING//
                    "current recipe":                 this.sayCurrentRecipe.bind(this), //NEED TESTING//
                    "switch to *recipe":  (recipe) => this.findAndSwitchToRecipe(recipe), //NEED TESTING//

                    //Placed down here to give priority matching to commands above
                    "(okay) continue":                this.processSayingNext.bind(this),
                    "(what's) (what is) next (*any)": this.processSayingNext.bind(this),

                    "*wild": (wild) => console.log("Unknown command: " + wild),
                };

                //Add commands to annyang
                annyang.addCommands(commands);

                //Start listening
                annyang.start({autoRestart: true, continuous: false});
                annyang.debug(true);
                this.setState({annyangStarted: true})
            }

            return true;
        }

        console.log("Annyang is not available");
        return false;
    }

    disableAnnyang()
    {
        //TODO: Should not be available to the general public
        annyang.abort();
        this.sayText("The microphone has been turned off.");
    }


    //Speech Synthesis Util//

    async generateSpeakingId()
    {
        let speakingId;

        do
        {
            speakingId = Math.floor(Math.random() * 100);
        } while(speakingId === 0 || speakingId === this.state.speakingId); //Can't be 0 (not speaking) or number currently in use

        await this.setStateAndWait({speakingId: speakingId});
        return speakingId;
    }

    sayText(text)
    {
        //Stop in case it was already talking
        this.stopTalking();

        //Setup
        let utterance = this.state.utterance;

        if (!IS_TEST_ENVIRONMENT) //No speech synthesis in a test envrionment
        {
            let voices = window.speechSynthesis.getVoices();
            utterance.text = text;
            utterance.voice = voices[1]; //Nicer male voice
        }

        this.setState
        ({
            utterance: utterance,
            paused: false,
            waitingForNext: false,
        });
        this.updateCurrentRecipe({lastSpoken: text});

        //Actually talk
        if (this.debugLog())
            console.log(text);

        if (!IS_TEST_ENVIRONMENT)
            window.speechSynthesis.speak(utterance);
    }

    async sayTextAndCheckStopped(textToSay)
    {
        this.sayText(textToSay);
        let speakingId = await this.generateSpeakingId();
        await this.sleepUntilSpeechIsDone(speakingId);
        return this.tryProcessStopReading(speakingId);
    }

    async sleepUntilSpeechIsDone(lastTextSpeakingId)
    {
        while (BotIsTalking()
        && this.state.speakingId === lastTextSpeakingId) //It's not new text the bot is speaking
            await sleep(250);
    }

    stopTalking()
    {
        if (BotIsTalking())
        {
            if (this.debugLog())
                console.log("Stopping speech")
            window.speechSynthesis.cancel();
            this.setState({speakingId: 0});
        }
    }

    pauseTalking()
    {
        if (BotIsTalking())
        {
            if (this.debugLog())
                console.log("Pausing speech")
            window.speechSynthesis.pause();
            this.setState({paused: true});
        }
    }

    resumeTalking()
    {
        if (this.state.paused)
        {
            if (this.debugLog())
                console.log("Resuming speech")
            window.speechSynthesis.resume(); //Should continue execution in the function that used to be speaking
            this.setState({paused: false});
        }
    }

    toggleStepByStep(toggle)
    {
        if (toggle)
        {
            if (this.debugLog())
                console.log("Toggled reading slower");
        }   
        else
        {
            if (this.debugLog())
                console.log("Toggled reading faster");
    
            if (this.state.waitingForNext)
                this.processSayingNext(); //If waiting for next, toggling faster will start it automatically
        }

        this.setState({stepByStep: toggle});
    }

    tryProcessStopReading(lastTextSpeakingId)
    {
        return this.state.speakingId !== lastTextSpeakingId; //New speech has started since previous text was read
    }

    async processSayingNext()
    {
        if (!BotIsTalking())
        {
            var readingState = this.getCurrentRecipe().readingState;

            switch (readingState)
            {
                case READING_INGREDIENTS:
                    if (!this.state.waitingForNext && this.startedReadingInstructions()
                    && this.getCurrentRecipe().currentlyReadingIngredientLine < this.getCurrentRecipe().ingredientsList.length) //If it's finished it should be allowed in to say just "say instructions"
                        this.sayText('Please say either "continue ingredients" or "continue instructions".');
                    else
                        await this.readIngredients();
                    break;
                case READING_INSTRUCTIONS:
                    await this.readInstructions();
                    break;
                case READING_SPECIFIC_INSTRUCTION:
                    await this.repeatSpecificStep(this.getCurrentRecipe().repeatingSpecificStep, false);
                    break;
                default:
                    break;
            }
        }
    }

    shouldWaitForNext()
    {
        if (this.state.stepByStep)
        {
            this.setState({waitingForNext: true});
            return true;
        }

        return false;
    }

    repeatLastSpoken()
    {
        if (!BotIsTalking())
        {
            var lastSpoken = this.getCurrentRecipe().lastSpoken;

            if (lastSpoken.length > 0)
                this.sayText(lastSpoken);
            else
                this.sayText("Nothing has been spoken yet");
        }
    }

    repeatLastStep()
    {
        if (!BotIsTalking())
        {
            var lastStepSpoken = this.getCurrentRecipe().lastStepSpoken;

            if (lastStepSpoken.length > 0)
                this.sayText(lastStepSpoken);
            else
                this.sayText("No instruction has been spoken yet");
        }
    }

    async startListeningAndReading()
    {
        await this.saveRecipe();
        if (this.tryStartAnnyang())
            this.sayText('Welcome! Please say either "ingredients" or "instructions"');
    }


    //Ingredients Commands//
    ingrdientsListIsEmpty()
    {
        return this.getCurrentRecipe() == null
            || this.getCurrentRecipe().ingredientsList == null
            || this.getCurrentRecipe().ingredientsList.length === 0;
    }

    async readIngredients()
    {
        if (this.ingrdientsListIsEmpty())
            this.sayText("Enter ingredients first.")
        else
        {
            this.updateCurrentRecipe({readingState: READING_INGREDIENTS});

            if (this.getCurrentRecipe().currentlyReadingIngredientLine === 0) //Haven't started reading the ingredients
            {
                if (await this.sayTextAndCheckStopped("You will need the following ingredients:"))
                    return; //Stopped in the middle of speaking
            }

            await this.readIngredientList(); //Didn't stop in the middle of speaking so continue to the ingredients
        }
    }

    async readIngredientListFromScratch()
    {
        if (this.ingrdientsListIsEmpty())
            this.sayText("Enter ingredients first.")
        else
        {
            await this.updateCurrentRecipeAndWait
            ({
                readingState: READING_INGREDIENTS,
                currentlyReadingIngredientLine: 0,
            });

            if (!(await this.sayTextAndCheckStopped("You will need the following ingredients:")))
                await this.readIngredientList(); //Didn't stop in the middle of speaking so continue to the ingredients
        }
    }

    async readIngredientList()
    {
        let i, textToSay;
        var ingredientsList = this.getCurrentRecipe().ingredientsList;

        for (i = this.getCurrentRecipe().currentlyReadingIngredientLine; i < ingredientsList.length; ++i)
        {
            textToSay = ingredientsList[i];

            if (i + 1 >= ingredientsList.length) //Last ingredient
            {
                if (ingredientsList.length >= 3) //At least three ingredients
                    textToSay = "And finally, " + textToSay;
                else if (ingredientsList.length === 2)
                    textToSay = "And " + textToSay;
            }

            if (await this.sayTextAndCheckStopped(textToSay))
                return; //Stopped in the middle of speaking

            await this.updateCurrentRecipeAndWait({currentlyReadingIngredientLine: i + 1}); //Here and not at the start of the loop because if the next is cancelled, it should still start from the next step
            if (this.shouldWaitForNext())
                return; //Exit the function until the user says next
        }

        if (this.startedReadingInstructions())
        {
            if (this.repeatingSpecificInstruction())
                this.sayText(`To continue repeating step ${this.getRepeatedAudibleSpecificStep()}, say "continue repeating step".`
                           + ` To continue the instructions from step ${this.getCurrentAudibleStep()}, say "continue instructions".`);
            else
                this.sayText('To continue the instructions, say "continue instructions".');
        }
        else if (this.repeatingSpecificInstruction())
        {
            this.sayText(`To continue reading just step ${this.getRepeatedAudibleSpecificStep()}, say "continue repeating step".`);
        }
        else
            this.sayText('To continue with the instructions, say "instructions".');
    }

    howMuchIngredient(ingredient)
    {
        ingredient = ingredient.toLowerCase();
        var matches = this.getCurrentRecipe().ingredientsList.filter(item => item.includes(ingredient));

        if (matches.length === 1)
            return matches[0];
        else
            return ingredient; //Either 0 or multiple matches, and if multiple better not to make a mistake
    }

    repeatSpecificIngredient(ingredient)
    {
        var matches, ingredientWords;
        ingredient = ingredient.toLowerCase();
        ingredientWords = ingredient.split(" ");

        if (ingredientWords.length >= 2) //Do a straight text match for multiple words
        {
            matches = this.getCurrentRecipe().ingredientsList
                        .filter(item => item.includes(ingredient)
                                    || (ingredient.endsWith("s") && item.includes(ingredient.slice(0, -1)))); //Allows matching "oils" to "1 tbsp oil"
        }
        else
        {
            matches = this.getCurrentRecipe().ingredientsList
                        .filter(item => item.split(" ").indexOf(ingredient) !== -1
                                    || item.split(" ").indexOf(ingredient + "s") !== -1 //Allows matching "chip" to "1 bag of chips"
                                    || (ingredient.endsWith("s") && item.split(" ").indexOf((ingredient.slice(0, -1))) !== -1)); //Allows matching "oils" to "1 tbsp oil"
        }

        if (matches.length === 0)
            this.sayText(`${ingredient} was not found in the ingredients.`);
        else if (matches.length === 1)
            this.sayText(matches[0]);
        else
        {
            let textToSay = `There are multiple ingredients with "${ingredient}". `;
            textToSay += matches.slice(0, -1).join(', ') +  ', and ' + matches.slice(-1); //Concatenate all together nicely with the last element having an "and" before it
            this.sayText(textToSay);
        }
    }


    //Instructions Commands//
    instructionsListIsEmpty()
    {
        return this.getCurrentRecipe() == null
            || this.getCurrentRecipe().instructionsList == null
            || this.getCurrentRecipe().instructionsList.length === 0;
    }

    startedReadingInstructions()
    {
        return this.getCurrentRecipe().currentlyReadingInstructionLine !== 0
            || this.getCurrentRecipe().currentlyReadingSubInstructionLine !== 0;
    }

    repeatingSpecificInstruction()
    {
        var specificStep = this.getCurrentRecipe().repeatingSpecificStep;

        return specificStep >= 0
            && this.getCurrentRecipe().currentlyReadingSpecificSubInstructionLine <
                this.getCurrentRecipe().instructionsList[specificStep].length;
    }

    async readInstructions()
    {
        if (this.instructionsListIsEmpty())
            this.sayText("Enter instructions first.");
        else
        {
            this.updateCurrentRecipe
            ({
                readingState: READING_INSTRUCTIONS,
                repeatingSpecificStep: -1, //Cancel if one was in the middle
            });

            if (!this.startedReadingInstructions())
            {
                if (await this.sayTextAndCheckStopped("You will need to follow these steps:"))
                    return; //Stopped in the middle of speaking
            }

            await this.readInstructionList(); //Didn't stop in the middle of speaking so continue to the instructions
        }
    }
        
    async readInstructionListFromScratch()
    {
        if (this.instructionsListIsEmpty())
            this.sayText("Enter instructions first.");
        else
        {
            await this.updateCurrentRecipeAndWait
            ({
                readingState: READING_INSTRUCTIONS,
                currentlyReadingInstructionLine: 0,
                currentlyReadingSubInstructionLine: 0,
                repeatingSpecificStep: -1, //Cancel if one was in the middle
            });

            if (!(await this.sayTextAndCheckStopped("You will need to follow these steps:")))
                await this.readInstructionList(); //Didn't stop in the middle of speaking so continue to the instructions    
        }
    }

    async readInstructionList()
    {
        var i, j;
        var instructionsList = this.getCurrentRecipe().instructionsList;

        for (i = this.getCurrentRecipe().currentlyReadingInstructionLine; i < instructionsList.length; ++i)
        {
            let firstInstruction = true; //Inside i loop so it says the step name and then continues to the first sentence in the step

            for (j = this.getCurrentRecipe().currentlyReadingSubInstructionLine; j < instructionsList[i].length; ++j)
            {
                let textToSay = instructionsList[i][j];

                if (firstInstruction)
                {
                    firstInstruction = false;
                    if (j === 0)
                        textToSay = `Step ${i + 1}. ` + textToSay;
                    else if (!this.state.waitingForNext)
                        textToSay = `Continuing step ${i + 1}. ` + textToSay;
                }

                this.updateCurrentRecipe({lastStepSpoken: textToSay})
                if (await this.sayTextAndCheckStopped(textToSay))
                    return; //Stopped in the middle of speaking

                await this.updateCurrentRecipeAndWait({currentlyReadingSubInstructionLine: j + 1}); //Here and not at the start of the loop because if the function leaves during the next return, the last step will be repeated
                if (this.shouldWaitForNext())
                    return; //Exit the function until the user says next
            }

            await this.updateCurrentRecipeAndWait
            ({
                currentlyReadingInstructionLine: i + 1,
                currentlyReadingSubInstructionLine: 0,
            });
        }

        this.sayText(`You've reached the end of the instructions for ${this.getCurrentRecipe().title}!`);
    }

    isNotValidStepNumber(i)
    {
        return isNaN(i) || i >= this.getCurrentRecipe().instructionsList.length || i < 0;
    }

    async readInstructionListFromStep(step)
    {
        this.stopTalking();

        try
        {
            let i = ParseStepNumber(step);

            if (this.isNotValidStepNumber(i))
                throw(new Error(`${i} is out of bounds of the instructions list`));

            await this.updateCurrentRecipeAndWait
            ({
                readingState: READING_INSTRUCTIONS,
                currentlyReadingInstructionLine: i,
                currentlyReadingSubInstructionLine: 0,
            });

            await this.readInstructionList();
        }
        catch (e)
        {
            let error = `"${step}" is not a valid step number`;
            if (this.debugLog())
                console.log(error);
            this.sayText(error);
        }
    }

    async repeatSpecificStepFromScratch(step)
    {
        try
        {
            let i = ParseStepNumber(step);

            if (this.isNotValidStepNumber(i))
                throw(new Error(`${i} is out of bounds of the instructions list`));

            await this.repeatSpecificStep(i, true);
        }
        catch (e)
        {
            let error = `"${step}" is not a valid step number.`;
            this.sayText(error);
        }
    }

    async continueRepeatingSpecificStep()
    {
        if (this.getCurrentRecipe().repeatingSpecificStep < 0)
            this.sayText(`No step is currently being repeated. To read a specific step, say something like "repeat step 2".`);
        else
            await this.repeatSpecificStep(this.getCurrentRecipe().repeatingSpecificStep, false);
    }

    async repeatSpecificStep(i, startFromScratch)
    {
        var instructionList = this.getCurrentRecipe().instructionsList;
        var firstInstruction = true;

        this.updateCurrentRecipe
        ({
            readingState: READING_SPECIFIC_INSTRUCTION,
            repeatingSpecificStep: i,
        });

        if (startFromScratch)
            await this.updateCurrentRecipeAndWait({currentlyReadingSpecificSubInstructionLine: 0});

        for (let j = this.getCurrentRecipe().currentlyReadingSpecificSubInstructionLine; j < instructionList[i].length; ++j)
        {
            let textToSay = instructionList[i][j];

            if (firstInstruction)
            {
                firstInstruction = false;
                if (j === 0)
                    textToSay = `Step ${i + 1}. ` +  textToSay;
                else if (!this.state.waitingForNext)
                    textToSay = `Continuing step ${i + 1}. ` +  textToSay;
            }

            if (await this.sayTextAndCheckStopped(textToSay))
                return; //Stopped in the middle of speaking

            await this.updateCurrentRecipeAndWait({currentlyReadingSpecificSubInstructionLine: j + 1}); //Here and not at the start of the loop because if the function leaves during the next return, the last step will be repeated
            if (this.shouldWaitForNext())
                return; //Exit the function until the user says next
        }

        this.sayText(`That is the end of step ${i + 1}. To continue from where you left off, say "continue instructions". To continue from the next step, say "read from step ${i + 2}".`);
    }

    findSpecificStepWith(details)
    {
        var textToSay;
        var matchedSteps = [];
        var searchForMultiWord = details.split(" ").length !== 1;
        var instructionList = this.getCurrentRecipe().instructionsList;
        details = details.toLowerCase();

        for (let i = 0; i < instructionList.length; ++i)
        {
            for (let j = 0; j < instructionList[i].length; ++j)
            {
                if (!searchForMultiWord)
                {
                    if (instructionList[i][j].split(" ").indexOf(details) !== -1 //Match whole word only
                    || instructionList[i][j].split(" ").indexOf(details + "s") !== -1 //Match whole word only again but also matches "Egg to Eggs"
                    || (details.endsWith("s") && instructionList[i][j].split(" ").indexOf(details.slice(0, -1)) !== -1)) //Egg details is "eggs" but step says "egg"
                    {
                        matchedSteps.push(i + 1);
                        break; //No point matching this step more times
                    }
                }
                else //Searching for a multi-word phrase
                {
                    let stepWords = instructionList[i][j].split(" ");
                    let phraseWords = details.split(" ");

                    if (stepWords.indexOf(phraseWords[0]) !== -1) //First part of phrase was found in this step
                    {
                        let found = true;

                        for (let k = 1; k < phraseWords.length; ++k) //Search for rest of phrase in step
                        {
                            if (stepWords.indexOf(phraseWords[k], stepWords.indexOf(phraseWords[k - 1]) + 1) === -1)
                            {
                                found = false;
                                break;
                            }
                        }

                        if (found)
                        {
                            matchedSteps.push(i + 1);
                            break; //No point matching this step more times
                        }
                    }
                }
            }
        }

        if (matchedSteps.length === 0)
            textToSay = `No step was found with `;
        else if (matchedSteps.length === 1)
            textToSay = `Step ${matchedSteps[0]} contains `;
        else if (matchedSteps.length === 2)
            textToSay = `Steps ${matchedSteps[0]} and ${matchedSteps[1]} both contain `;
        else
        {
            textToSay = "Steps " + matchedSteps.slice(0, -1).join(', ') //Connect all steps except for the last two with a comma
                      + ', and ' + matchedSteps[matchedSteps.length - 1] + " contain "; //Connect the last step with an and
        }

        textToSay += `the phrase "${details}".`;
        this.sayText(textToSay);
    }

    whichStepIsCurrent()
    {
        let textToSay;
        let readingState = this.getCurrentRecipe().readingState;
        let currStep = this.getCurrentRecipe().currentlyReadingInstructionLine;
        let instructionList = this.getCurrentRecipe().instructionsList;
        let recipeTitle = this.getCurrentRecipe().title;

        if (readingState === READING_SPECIFIC_INSTRUCTION
        && this.getCurrentRecipe().currentlyReadingSpecificSubInstructionLine <
            instructionList[this.getCurrentRecipe().repeatingSpecificStep].length) //Didn't finish specific step yet
        {
            textToSay = `Currently repeating step ${this.getRepeatedAudibleSpecificStep()} of ${recipeTitle}.`;

            if (currStep < instructionList.length)
                textToSay += ` And currently paused reading step ${currStep + 1}.`;
        }
        else
        {
            if (currStep >= instructionList.length)
                textToSay = `The instructions for ${recipeTitle} are finished.`;
            else if (!this.startedReadingInstructions())
                textToSay = `The instructions for ${recipeTitle} have not been started. To read the instructions, say "instructions".`;   
            else
                textToSay = `Currently reading step ${currStep + 1} of ${recipeTitle}.`;
        }

        this.sayText(textToSay);
    }


    //Recipe Title Commands//
    sayCurrentRecipe()
    {
        this.sayText(`Now cooking ${this.getCurrentRecipe().title}.`);
    }

    async findAndSwitchToRecipe(recipeDetails)
    {
        var currentRecipeTitle = this.getCurrentRecipe().title;
        console.log(this.state.recipes)

        let possibleRecipeIds = this.state.recipes.reduce((ids, recipe, i) =>
        {
            if (recipe.title.toLowerCase().includes(recipeDetails.toLowerCase()))
                ids.push(i);
            return ids;
        }, []); //Creates a list of ids where the recipe title matches the given details

        //Filter out current recipe only if multiple because we still want to match for 1
        if (possibleRecipeIds.length >= 2)
            possibleRecipeIds = possibleRecipeIds.filter(recipeId => this.state.recipes[recipeId].title !== currentRecipeTitle);

        //Process based on amount matched
        if (possibleRecipeIds.length === 0)
            this.sayText(`No recipes were found for "${recipeDetails}".`);
        else if (possibleRecipeIds.length === 1)
        {
            if (possibleRecipeIds[0] === this.state.currentRecipe)
                this.sayText(`You're already cooking ${currentRecipeTitle}.`)
            else
            {
                await this.changeToRecipe(possibleRecipeIds[0]);
                this.sayCurrentRecipe();
            }
        }
        else
        {
            let textToSay = `Multiple recipes contain the phrase "${recipeDetails}". Which of these did you mean? `;
            for (let recipeId of possibleRecipeIds)
                textToSay += this.state.recipes[recipeId].title + ". ";

            this.sayText(textToSay.trim());
        }
    }


    //GUI Util//

    recipeListDropdown()
    {
        let dropdownItems = [];

        if (this.state.recipes.length === 0) //No saved recipes yet
            dropdownItems = [<Dropdown.Item key={0}>No saved recipes!</Dropdown.Item>];
        else
        {
            for (let i = 0; i < this.state.recipes.length; ++i)
            {
                dropdownItems.push(
                    <Dropdown.Item onClick={this.changeToRecipe.bind(this, i)} key={i}>
                        {this.state.recipes[i].title}
                    </Dropdown.Item>
                );
            }
        }

        return (
            <Dropdown className="saved-recipes">
                <Dropdown.Toggle variant="success" id="dropdown-basic">
                    Choose Recipe
                </Dropdown.Toggle>

                <Dropdown.Menu>
                    {dropdownItems}
                </Dropdown.Menu>
            </Dropdown>
        );
    }

    render()
    {
        return (
            <div className="recipe-view">
                <div className="recipe-list-dropdown">
                    {this.recipeListDropdown()}
                    <button className="new-recipe-button" onClick={this.wipeRecipe.bind(this)}>New Recipe</button>
                </div>
                <Form className="recipe-form">
                    <FormControl
                        className="recipe-name-input"
                        placeholder="Add Recipe Name"
                        value={this.state.titleInput}
                        onChange={(e) => this.setState({titleInput: e.target.value})}
                    />

                    <TextareaAutosize
                        className="recipe-ingredients-input"
                        placeholder="Add Ingredients"
                        value={this.state.ingredientsInput}
                        onChange={(e) => this.setState({ingredientsInput: e.target.value})}
                        style={{resize: 'none', overflow: 'hidden'}}
                    />

                    <TextareaAutosize
                        className="recipe-instructions-input"
                        placeholder="Add Instructions"
                        value={this.state.instructionsInput}
                        onChange={(e) => this.setState({instructionsInput: e.target.value})}
                        style={{resize: 'none', overflow: 'hidden'}}
                    />
                </Form>

                <div className="recipe-buttons">
                    <button onClick={this.saveRecipe.bind(this)}>Save Recipe</button>
                    <button onClick={this.startListeningAndReading.bind(this)}>Save & Start Reading</button>
                </div>
            </div>
        );
    }
}


function BotIsTalking()
{
    if (IS_TEST_ENVIRONMENT)
        return false;

    return window.speechSynthesis.speaking;
}

function ParseStepNumber(step)
{
    let i = parseInt(step) - 1;

    if (isNaN(i))
        i = parseInt(numerizer(step)) - 1; //Try to convert it from text like "one"

    return i;
}

export default Recipe;
