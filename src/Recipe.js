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
    lastSpoken: "",
    lastStepSpoken: "",
    readingState: 0,
};

//TODO: Prevent adding multiple recipes with the same name and set limit for recipe title
//TODO: Add user notice when trying to save a recipe with a title that's already in use
//TODO: Add a "cooking this" feature to check off which recipes are currently being made. That way switching between recipes will only take those into account.


class Recipe extends Component
{
    constructor(props)
    {
        super(props);

        let msg = new SpeechSynthesisUtterance();
        let voices = window.speechSynthesis.getVoices();
        msg.voice = voices[1]; //Nicer male voice
        // localStorage.recipes = "[]";

        this.state =
        {
            titleInput: "",
            ingredientsInput: "",
            instructionsInput: "",
            annyangStarted: false,
            msg: msg,
            paused: false,
            stepByStep: false,
            waitingForNext: false,
            cancelWaitingForNext: false,
            speakingId: 0,
            recipes: ("recipes" in localStorage) ? JSON.parse(localStorage.recipes) : [],
            currentRecipe: -1,
            currentRecipeIsSaved: false,
        };
    }

    async setStateAndWait(newState)
    {
        return new Promise(resolve => this.setState(newState, resolve));
    }

    async changeToRecipe(recipeId)
    {
        this.stopTalking();
        this.tryCancelWaitingForNext();

        await this.setStateAndWait
        ({
            currentRecipe: recipeId,
            titleInput: this.state.recipes[recipeId].title,
            ingredientsInput: this.state.recipes[recipeId].rawIngredients,
            instructionsInput: this.state.recipes[recipeId].rawInstructions,
            paused: false,
        });
    }

    wipeRecipe()
    {
        this.stopTalking();
        this.tryCancelWaitingForNext();

        this.setState
        ({
            currentRecipe: -1,
            titleInput: "",
            ingredientsInput: "",
            instructionsInput: "",
            paused: false,
            currentRecipeIsSaved: false,
        }); 
    }

    getCurrentRecipe()
    {
        return this.state.recipes[this.state.currentRecipe];
    }

    async updateCurrentRecipe(newObj, wait=false)
    {
        var currentRecipe = this.getCurrentRecipe();
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

    async saveRecipe()
    {
        var recipes;

        if (!this.state.currentRecipeIsSaved) //Brand new recipe
        {
            recipes = this.state.recipes;
            recipes.push(Object.assign({}, RECIPE_STRUCT));
            
            for (let recipe of recipes)
            {
                if (recipe.title.toLowerCase() === this.state.titleInput)
                {
                    console.log(`A recipe names "${this.state.titleInput}" already exists! Cancelling saving.`);
                    //TODO: Add user notice
                    return;
                }
            }

            await this.setStateAndWait
            ({
                recipes: recipes,
                currentRecipe: recipes.length - 1,
                currentRecipeIsSaved: true,
            });
        }

        await this.processTitle();
        await this.processIngredients();
        await this.processInstructions();

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

    async processTitle()
    {
        if (this.state.titleInput.length > 0)
            await this.updateCurrentRecipeAndWait({title: this.state.titleInput});
    }

    async processIngredients()
    {
        if (this.state.ingredientsInput.length > 0)
        {
            var ingredients = this.state.ingredientsInput.replace(/(^[ \t]*\n)/gm, "").trim(); //Remove blank lines
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
            var instructionNumberRegex = /^(Step|Part|Instruction)?\s*[0-9]+\s?[\.|\-|\)]*\s*/; //Matches characters like "1.", "2)", "3-", etc.

            for (let i = 0; i < instructionsList.length; ++i)
            {
                let instruction = instructionsList[i];

                //Remove the leading number from the instruction if present
                if (instruction.match(instructionNumberRegex))
                    instruction = instruction.replace(instructionNumberRegex, '');

                //Splitting at the period allows the bot to read sentence by sentence
                let subInstructionList = instruction.split(".");

                if (subInstructionList.at(-1).length === 0)
                    subInstructionList.pop(); //Remove blank entries at end of list

                instructionsList[i] = subInstructionList;
            }

            await this.updateCurrentRecipeAndWait({instructionsList: instructionsList, rawInstructions: this.state.instructionsInput.trim()});
        }
    }

    toggleStepByStep(toggle)
    {
        if (toggle)
            console.log("Toggled reading slower");
        else
        {
            console.log("Toggled reading faster");
            this.setState({waitingForNext: false}); //If waiting for next, toggling faster will start it automatically
        }

        this.setState({stepByStep: toggle});
    }

    tryStartAnnyang()
    {
        if (annyang)
        {
            if (this.state.annyangStarted)
            {
                console.log("Annyang already running");
            }
            else
            {
                console.log("Starting Annyang");

                //Define commands
                var commands =
                {
                    'hello': () => this.sayText("Hello, I am a recipe bot. But you can call me Yousef."),
                    'yousef': () => this.sayText("What would you like, master?"),
                    'yusuf': () => this.sayText("What would you like, master?"),
                    '(read) slower': this.toggleStepByStep.bind(this, true),
                    '(read) flower': this.toggleStepByStep.bind(this, true), //Commonly heard instead of "slower"
                    '(read) lower': this.toggleStepByStep.bind(this, true),
                    '(read) slowly': this.toggleStepByStep.bind(this, true),
                    '(read) faster': this.toggleStepByStep.bind(this, false),
                    'pause': this.pauseTalking.bind(this),
                    //resume
                    'stop': this.stopTalking.bind(this),
                    'shop': this.stopTalking.bind(this), //Commonly heard instead of "stop"
                    'disable': this.disableAnnyang.bind(this),
                    'repeat': this.repeatLastSpoken.bind(this),
                    '(okay) continue': this.continueReading.bind(this),
                    '(what\'s) (what is) next': this.processSayingNext.bind(this),

                    'continue (reading) ingredients(s)': this.readIngredients.bind(this),
                    '(read) (list) ingredient(s)': this.readIngredientListFromScratch.bind(this),
                    'how much *ingredient': (ingredient) => this.repeatSpecificIngredient(ingredient),
                    'how many *ingredient': (ingredient) => this.repeatSpecificIngredient(ingredient),

                    'continue (reading) instruction(s)': this.readInstructions.bind(this),
                    '(read) (list) instruction(s)': this.readInstructionListFromScratch.bind(this),
                    'repeat step *number': (number) => this.repeatSpecificStep(number),
                    '(read) (repeat) from step *number': (number) => this.readInstructionListFromStep(number),
                    'repeat last step': this.repeatLastStep.bind(this),
                    'which step has (the word) *details': (details) => this.findSpecificStepWith(details),
                    //'which step am i on'

                    'switch to *recipe': (recipe) => this.findAndSwitchToRecipe(recipe),
                    'which recipe (am i cooking)': this.sayCurrentRecipe.bind(this),

                    '*wild': (wild) => console.log("Unknown command: " + wild),
                };

                //Add commands to annyang
                annyang.addCommands(commands);
    
                //Start listening
                annyang.start();
                this.setState({annyangStarted: true})
            }

            return true;
        }

        return false;
    }

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
        this.tryCancelWaitingForNext();

        //Setup
        let msg = this.state.msg;
        let voices = window.speechSynthesis.getVoices();
        msg.text = text;
        msg.voice = voices[1]; //Nicer male voice
        this.setState
        ({
            msg: msg,
            paused: false,
        });
        this.updateCurrentRecipe({lastSpoken: text});

        //Actually talk
        console.log(text)
        window.speechSynthesis.speak(msg);
        annyang.resume();
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
            console.log("Stopping speech")
            window.speechSynthesis.cancel();
            this.setState({speakingId: 0});
        }
    }

    pauseTalking()
    {
        if (BotIsTalking())
        {
            console.log("Pausing speech")
            window.speechSynthesis.pause();
            this.setState({paused: true});
        }
    }

    resumeTalking()
    {
        if (this.state.paused)
        {
            console.log("Resuming speech")
            window.speechSynthesis.resume(); //Should continue execution in the function that used to be speaking
            this.setState({paused: false});
        }
    }

    disableAnnyang()
    {
        annyang.abort();
        this.sayText("Annyang is no longer listening.");
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

    tryProcessStopReading(lastTextSpeakingId)
    {
        if (this.state.speakingId !== lastTextSpeakingId) //New speech has started since previous text was read
            return true;

        return false;
    }

    processSayingNext()
    {
        if (!BotIsTalking() && this.state.waitingForNext)
            this.setState({waitingForNext: false, cancelWaitingForNext: false});
        else
            this.continueReading(); //Treat like continue if not waiting for next
    }

    async tryWaitUntilHearingNext(debug="")
    {
        if (this.state.stepByStep)
        {
            console.log("Waiting for next...", debug)
            await this.setStateAndWait({waitingForNext: true});
            while (this.state.waitingForNext)
                await sleep(250);

            await this.setStateAndWait({waitingForNext: false});
            if (this.state.cancelWaitingForNext)
            {
                console.log("Cancelled waiting for next", debug)
                this.setState({cancelWaitingForNext: false});
                return false;
            }
            else    
                console.log("Heard next!")
        }

        return true;
    }

    tryCancelWaitingForNext()
    {
        if (this.state.waitingForNext)
            this.setState({waitingForNext: false, cancelWaitingForNext: true});
    }

    startedReadingInstructions()
    {
        return this.getCurrentRecipe().currentlyReadingInstructionLine !== 0
            || this.getCurrentRecipe().currentlyReadingSubInstructionLine !== 0;
    }

    async startListeningAndReading()
    {
        await this.saveRecipe();
        if (this.tryStartAnnyang())
            this.sayText('Welcome! Please say either "ingredients" or "instructions"');
    }

    async continueReading()
    {
        if (!BotIsTalking())
        {
            if (this.state.waitingForNext)
            {
                //Treat like "next"
                this.processSayingNext();
            }
            else
            {
                var readingState = this.getCurrentRecipe().readingState;

                if (readingState === READING_INSTRUCTIONS)
                    await this.readInstructions();
                else if (readingState === READING_INGREDIENTS)
                {
                    if (this.startedReadingInstructions())
                        this.sayText('Please say either "continue ingredients" or "continue instructions"');
                    else
                        await this.readIngredients();
                }
            }
        }
    }

    async readIngredients()
    {

        if (this.getCurrentRecipe().ingredientsList.length === 0)
            this.sayText("Enter ingredients first.")
        else
        {
            this.updateCurrentRecipe({readingState: READING_INGREDIENTS});

            if (this.getCurrentRecipe().currentlyReadingIngredientLine === 0)
            {
                this.tryCancelWaitingForNext();
                if (await this.sayTextAndCheckStopped("First, you will need the following ingredients:"))
                    return; //Stopped in the middle of speaking
            }

            await this.readIngredientList(); //Didn't stop in the middle of speaking so continue to the ingredients
        }
    }

    async readIngredientListFromScratch()
    {
        this.tryCancelWaitingForNext();

        if (this.getCurrentRecipe().ingredientsList.length === 0)
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

            await this.updateCurrentRecipeAndWait({currentlyReadingIngredientLine: i + 1}); //Because if the next is cancelled, it should still start from the next step
            if (!(await this.tryWaitUntilHearingNext()))
                return; //Gave up waiting for the "next" command
        }

        this.sayText('To continue with the instructions, say "instructions"')
    }

    repeatSpecificIngredient(ingredient)
    {
        var matches = [];
        ingredient = ingredient.toLowerCase();

        for (let item of this.getCurrentRecipe().ingredientsList)
        {
            if (item.includes(ingredient))
                matches.push(item);    
        }

        if (matches.length === 0)
            this.sayText(`${ingredient} was not found in the ingredients`);
        else if (matches.length === 1)
            this.sayText(matches[0]);
        else
        {
            let textToSay = `There are multiple ingredients with "${ingredient}". `;
            for (let i = 0; i < matches.length; ++i)
            {
                let item = matches[i];

                if (i + 1 >= matches.length) //Last item
                    textToSay += "And " + item + ". "
                else
                    textToSay += item + ", "
            }

            this.sayText(textToSay);
        }
    }

    async readInstructions()
    {
        if (this.getCurrentRecipe().instructionsList.length === 0)
            this.sayText("Enter instructions first.");
        else
        {
            this.updateCurrentRecipe({readingState: READING_INSTRUCTIONS});

            if (!this.startedReadingInstructions())
            {
                this.tryCancelWaitingForNext();
                if (await this.sayTextAndCheckStopped("Next, you will need to follow these steps:"))
                    return; //Stopped in the middle of speaking
            }

            await this.readInstructionList(); //Didn't stop in the middle of speaking so continue to the instructions
        }
    }

    async readInstructionListFromScratch()
    {
        this.tryCancelWaitingForNext();

        if (this.getCurrentRecipe().instructionsList.length === 0)
            this.sayText("Enter instructions first.");
        else
        {
            await this.updateCurrentRecipeAndWait
            ({
                readingState: READING_INSTRUCTIONS,
                currentlyReadingInstructionLine: 0,
                currentlyReadingSubInstructionLine: 0,
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
                    else
                        textToSay = `Continuing step ${i + 1}.` + textToSay;
                }

                this.updateCurrentRecipe({lastStepSpoken: textToSay})
                if (await this.sayTextAndCheckStopped(textToSay))
                    return; //Stopped in the middle of speaking

                await this.updateCurrentRecipeAndWait({currentlyReadingSubInstructionLine: j + 1}); //Because if the function leaves during the next return, the last step will be repeated
                if (!(await this.tryWaitUntilHearingNext()))
                    return; //Gave up waiting for the "next" command
            }

            await this.updateCurrentRecipeAndWait({currentlyReadingSubInstructionLine: 0});
            await this.updateCurrentRecipeAndWait({currentlyReadingInstructionLine: i + 1});
        }

        this.sayText("You've reached the end of the instructions!");
    }

    parseStepNumber(step)
    {
        let i = parseInt(step) - 1;

        if (isNaN(i))
            i = parseInt(numerizer(step)) - 1; //Try to convert it from text like "one"

        return i;
    }

    async readInstructionListFromStep(step)
    {
        try
        {
            let i = this.parseStepNumber(step);

            if (isNaN(i) || i >= this.getCurrentRecipe().instructionsList.length || i < 0)
                throw(new Error(`${i} is out of bounds of the instructions list`));

            this.tryCancelWaitingForNext();
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
            console.log(error);
            this.sayText(error);
        }
    }

    async repeatSpecificStep(step)
    {
        //TODO: Saying "stop" in the middle and then "continue" won't pick up from where it was left off. Need a stack so old instructions don't lose their state
        let firstInstruction = true;
        var instructionList = this.getCurrentRecipe().instructionsList;

        try
        {
            let i = this.parseStepNumber(step);

            if (isNaN(i) || i >= instructionList.length || i < 0)
                throw(new Error(`${i} is out of bounds of the instructions list`));

            this.tryCancelWaitingForNext();

            for (let j = 0; j < instructionList[i].length; ++j)
            {
                let textToSay = instructionList[i][j];
                
                if (firstInstruction)
                {
                    textToSay = `Step ${i + 1}. ` +  textToSay;
                    firstInstruction = false;
                }

                if (await this.sayTextAndCheckStopped(textToSay))
                    return; //Stopped in the middle of speaking

                if (!(await this.tryWaitUntilHearingNext()))
                    return; //Gave up waiting for the "next" command
            }

            this.sayText(`That is the end of step ${step}. To continue from where you left off, say "continue". To continue from the next step, say "read from step ${i + 2}".`);
        }
        catch (e)
        {
            let error = `"${step}" is not a valid step number`;
            console.log(error);
            this.sayText(error);
        }
    }

    findSpecificStepWith(details)
    {
        var instructionList = this.getCurrentRecipe().instructionsList;

        for (let i = 0; i < instructionList.length; ++i)
        {
            for (let j = 0; j < instructionList[i].length; ++j)
            {
                if (instructionList[i][j].includes(details))
                {
                    this.sayText(`Step ${i} contains the phrase "${details}"`);
                    return;
                }
            }
        }

        this.sayText(`No instruction was found with the phrase "${details}"`);
    }

    async findAndSwitchToRecipe(recipeDetails)
    {
        let possibleRecipeIds = [];

        for (let i = 0; i < this.state.recipes.length; ++i)
        {
            let recipe = this.state.recipes[i];

            if (recipe.title.toLowerCase().includes(recipeDetails.toLowerCase()))
                possibleRecipeIds.push(i);
        }

        if (possibleRecipeIds.length === 0)
            this.sayText(`No recipes were found for "${recipeDetails}"`);
        else if (possibleRecipeIds.length === 1)
        {
            if (possibleRecipeIds[0] === this.state.currentRecipe)
                this.sayText(`You're already cooking ${this.getCurrentRecipe().title}.`)
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

            this.sayText(textToSay);
        }
    }

    sayCurrentRecipe()
    {
        this.sayText(`Now cooking ${this.getCurrentRecipe().title}.`);
    }

    recipeListDropdown()
    {
        let dropdownItems = [];

        if (this.state.recipes.length === 0)
            dropdownItems = [<Dropdown.Item key={0}>No saved recipes!</Dropdown.Item>];
        else
        {
            for (let i = 0; i < this.state.recipes.length; ++i)
            {
                let recipe = this.state.recipes[i];
                dropdownItems.push(
                    <Dropdown.Item onClick={this.changeToRecipe.bind(this, i)} key={i}>
                        {recipe.title}
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
    return window.speechSynthesis.speaking;
}

export default Recipe;
