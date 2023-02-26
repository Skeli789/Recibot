import { render, screen, fireEvent, act } from '@testing-library/react';
import annyang from 'annyang';


import Recipe from '../Recipe';
import {TEST_TITLE_1, TEST_TITLE_2, TEST_TITLE_3, TEST_TITLE_4, TEST_TITLE_5,
        TEST_INGREDIENTS_1, TEST_INGREDIENTS_INPUT_CONVERTED_1, TEST_INGREDIENTS_CONVERTED_1, TEST_INSTRUCTIONS_1, TEST_INSTRUCTIONS_CONVERTED_1, 
        TEST_INGREDIENTS_2, TEST_INGREDIENTS_INPUT_CONVERTED_2, TEST_INSTRUCTIONS_2, TEST_INSTRUCTIONS_CONVERTED_2, 
        TEST_INGREDIENTS_3, TEST_INGREDIENTS_CONVERTED_3, TEST_INSTRUCTIONS_3, TEST_INSTRUCTIONS_3_NO_NUMS, TEST_INSTRUCTIONS_3_CONVERTED,
        TEST_INGREDIENTS_4, TEST_INGREDIENTS_INPUT_CONVERTED_4, TEST_INGREDIENTS_CONVERTED_4, TEST_INSTRUCTIONS_4, TEST_INSTRUCTIONS_4_CONVERTED,
        TEST_INGREDIENTS_5, TEST_INGREDIENTS_CONVERTED_5, TEST_INSTRUCTIONS_5, TEST_INSTRUCTIONS_5_CONVERTED} from './TestRecipes';


//Mock Annyang Libray//

jest.mock('annyang', () => {
    let commands = {};

    const matchCommand = (command, input) =>
    {
        const commandParts = command.split(" ");
        const inputParts = input.split(" ");

        let inputIndex = 0;
        for (let i = 0; i < commandParts.length; ++i)
        {
            var commandPart = commandParts[i];

            if (commandPart[0] === ':')
            {
                if (inputIndex >= commandParts.length)
                    return false;

                //Named variable
                inputIndex++;
            }
            else if (commandPart[0] === '*')
            {
                //Splat - match rest of text
                return true;
            }
            else if (commandPart[0] === '(')
            {
                //Optional
                if (commandPart.length > 1 && commandPart[1] === ')')
                    continue; //Empty optional

                if (inputIndex >= commandParts.length)
                    continue; //Can't match this optional since no more text

                let optional = "";
                let breakLoop = false;
                let j = 1; //Start right after the "("
                for (; i < commandParts.length; ++i)
                {
                    commandPart = commandParts[i];
                    for (; j < commandPart.length; ++j)
                    {
                        if (commandPart[j] === ')')
                        {
                            breakLoop = true
                            break;
                        }
                        else
                            optional += commandPart[j];
                    }

                    if (breakLoop)
                        break;

                    j = 0;
                }

                optional = optional.trim();

                if (inputParts.slice(inputIndex, inputIndex + optional.split(" ").length).join(' ') === optional)
                    inputIndex += optional.split(" ").length;
            }
            else if (commandPart !== inputParts[inputIndex]
            && commandPart.replace(/\(.*\)/gm, "") !== inputParts[inputIndex]
            && commandPart.replace("(", "").replace(")", "") !== inputParts[inputIndex])
                return false;
            else
            {
                if (inputIndex >= commandParts.length)
                    return false;

                inputIndex++;
            }
        }

        if (inputIndex < inputParts.length)
            return false;

        return true;
    };

    return {
        addCommands: (newCommands) =>
        {
            commands = { ...commands, ...newCommands };
        },
        start: jest.fn(),
        debug: jest.fn(),
        trigger: (input) =>
        {
            const command = Object.keys(commands).find(command => matchCommand(command, input));
            if (command)
            {
                const parts = command.split(" ");
                const inputParts = input.split(" ");
                const args = parts.map((part, i) =>
                {
                    if (part[0] === ':') // Named variable
                        return inputParts[i];
                    else if (part[0] === '*') // Splat
                        return inputParts.slice(i).join(' '); //Bug: Can't currently match "which step has oven" (needs to be "which step has the word oven")
                });

                commands[command](...args.filter((i) => i != null));
            }
        },
        commands
    };
});


//Test Util Functions//
function FillRecipe1()
{
    act(() =>
    {
        fireEvent.change(titleInput, {target: {value: TEST_TITLE_1}});
        fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_1}});
        fireEvent.change(instructionsInput, {target: {value: TEST_INSTRUCTIONS_1}});
    });
}

function FillRecipe2()
{
    act(() =>
    {
        fireEvent.change(titleInput, {target: {value: TEST_TITLE_2}});
        fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_2}});
        fireEvent.change(instructionsInput, {target: {value: TEST_INSTRUCTIONS_2}});
    });
}

function FillRecipe3()
{
    act(() =>
    {
        fireEvent.change(titleInput, {target: {value: TEST_TITLE_3}});
        fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_3}});
        fireEvent.change(instructionsInput, {target: {value: TEST_INSTRUCTIONS_3}});
    });
}

function FillRecipe4()
{
    act(() =>
    {
        fireEvent.change(titleInput, {target: {value: TEST_TITLE_4}});
        fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_4}});
        fireEvent.change(instructionsInput, {target: {value: TEST_INSTRUCTIONS_4}});
    });
}

function FillRecipe5()
{
    act(() =>
    {
        fireEvent.change(titleInput, {target: {value: TEST_TITLE_5}});
        fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_5}});
        fireEvent.change(instructionsInput, {target: {value: TEST_INSTRUCTIONS_5}});
    });
}

function ExpectAllIngredientsRead(convertedIngredients)
{
    let ingredientsList = convertedIngredients.split("\n");

    for (let i = 0; i < ingredientsList.length; ++i)
    {
        let ingredient = ingredientsList[i];

        if (i + 1 >= ingredientsList.length) //Last ingredient is slightly different
            ingredient = "And finally, " + ingredient;

        expect(log).toHaveBeenCalledWith(ingredient);
    }
}

const sleep = ms => new Promise(
    resolve => setTimeout(resolve, ms)
);


//Tests//

var component, log, titleInput, ingredientsInput, instructionsInput, saveButton, startReadingButton, newRecipeButton, recipeListButton;
var welcomeMessage = 'Welcome! Please say either "ingredients" or "instructions"';

beforeEach(() =>
{
    localStorage.recipes = "[]";
    component = render(<Recipe />);
    titleInput = component.getByPlaceholderText("Add Recipe Name");
    ingredientsInput = component.getByPlaceholderText("Add Ingredients");
    instructionsInput = component.getByPlaceholderText("Add Instructions");
    saveButton = component.getByText("Save Recipe");
    startReadingButton = component.getByText("Save & Start Cooking");
    newRecipeButton = component.getByText("New Recipe");
    recipeListButton = component.getByText("Choose Recipe");
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
});

test('form can be filled out and reset', async () =>
{
    var button;

    //Saving an empty form should bring up an error pop-up
    act(() => {fireEvent.click(saveButton)});
    button = component.getByText("Okay");
    act(() => {fireEvent.click(button)});

    //Fill out the input fields
    FillRecipe1();

    //Confirm the inputs were filled out
    expect(titleInput.value).toBe(TEST_TITLE_1);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_1);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_1);

    //Click the new recipe button
    act(() => {fireEvent.click(newRecipeButton)});

    //Say no to the delete changes confirmation
    button = component.getByText("No");
    act(() => {fireEvent.click(button)});

    //Confirm changes were not wiped
    expect(titleInput.value).toBe(TEST_TITLE_1);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_1);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_1);

    //Click the new recipe button
    act(() => {fireEvent.click(newRecipeButton)});

    //Say yes to the delete changes confirmation
    button = component.getByText("Yes");
    await act(async () => {fireEvent.click(button)});

    //Confirm the inputs were wiped
    expect(titleInput.value).toBe("");
    expect(ingredientsInput.value).toBe("");
    expect(instructionsInput.value).toBe("");
});

test('form can be filled out multiple times and recipes can be switched between', async () =>
{
    var button;

    //Save recipe 1
    FillRecipe1();
    await act(async () => {fireEvent.click(saveButton)});

    //Save recipe 2
    act(() => {fireEvent.click(newRecipeButton)});
    FillRecipe2();
    await act(async () => {fireEvent.click(saveButton)});

    //Confirm the inputs were filled out
    expect(titleInput.value).toBe(TEST_TITLE_2);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_INPUT_CONVERTED_2);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_2);

    //Find and switch to recipe 1 in the recipe dropdown
    act(() => {fireEvent.click(recipeListButton)});
    await act(async () => {fireEvent.click(recipeListButton)});
    button =  component.getByText(TEST_TITLE_1);
    act(() => {fireEvent.click(button)});

    //Confirm the inputs changed back
    expect(titleInput.value).toBe(TEST_TITLE_1);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_INPUT_CONVERTED_1);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_1);

    //Make slight change and try switching to recipe 2
    fireEvent.change(titleInput, {target: {value: TEST_TITLE_1 + "a"}});
    await act(async () => {fireEvent.click(recipeListButton)});
    button = component.getByText(TEST_TITLE_2);
    act(() => {fireEvent.click(button)});

    //Say no to the delete changes confirmation
    button = component.getByText("No");
    act(() => {fireEvent.click(button)});

    //Confirm the inputs didn't change
    expect(titleInput.value).toBe(TEST_TITLE_1 + "a");
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_INPUT_CONVERTED_1);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_1);

    //Try switching to recipe 2 again
    await act(async () => {fireEvent.click(recipeListButton)});
    button =  component.getByText(TEST_TITLE_2);
    act(() => {fireEvent.click(button)});

    //Say yes to the delete changes confirmation
    button = component.getByText("Yes");
    await act(async () => {fireEvent.click(button)});

    //Confirm the inputs changed
    expect(titleInput.value).toBe(TEST_TITLE_2);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_INPUT_CONVERTED_2);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_2);

    //Find and switch recipe 1 in the recipe dropdown
    await act(async () => {fireEvent.click(recipeListButton)});
    button =  component.getByText(TEST_TITLE_1);
    act(() => {fireEvent.click(button)});

    //Confirm the inputs changed back
    expect(titleInput.value).toBe(TEST_TITLE_1);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_INPUT_CONVERTED_1);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_1);
});

test('filling out instructions auto-assigns numbers', async () =>
{
    //First fill out the instructions with no numbers
    FillRecipe3();
    fireEvent.change(instructionsInput, {target: {value: TEST_INSTRUCTIONS_3_NO_NUMS}});
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_3_NO_NUMS);

    //Then save and make sure the numbers were added
    await act(async () => {fireEvent.click(saveButton)});
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_3);
});

test('recipes can be deleted', async () =>
{
    var button, deleteButton;

    //Save recipe 1
    FillRecipe1();
    await act(async () => {fireEvent.click(saveButton)});

    //Save recipe 2
    act(() => {fireEvent.click(newRecipeButton)});
    FillRecipe2();
    await act(async () => {fireEvent.click(saveButton)});

    //Try Delete Recipe 2
    await act(async () => {fireEvent.click(recipeListButton)});
    deleteButton = component.getByTestId(`delete-recipe-${TEST_TITLE_2}`);
    await act(async () => {fireEvent.click(deleteButton)});

    //Say no to the delete changes confirmation
    button = component.getByText("No");
    act(() => {fireEvent.click(button)});

    //Confirm nothing was deleted
    expect(titleInput.value).toBe(TEST_TITLE_2);
    expect(ingredientsInput.value).toBe(TEST_INGREDIENTS_INPUT_CONVERTED_2);
    expect(instructionsInput.value).toBe(TEST_INSTRUCTIONS_2);

    //Try delete recipe 2 again
    await act(async () => {fireEvent.click(recipeListButton)});
    await act(async () => {fireEvent.click(deleteButton)});

    //Say no to the delete changes confirmation
    button = component.getByText("Yes");
    await act(async () => {fireEvent.click(button)});

    //Confirm input was wiped
    expect(titleInput.value).toBe("");
    expect(ingredientsInput.value).toBe("");
    expect(instructionsInput.value).toBe("");

    //Confirm recipe 2 is no longer in list
    await act(async () => {fireEvent.click(recipeListButton)});
    deleteButton = component.queryByTestId(`delete-recipe-${TEST_TITLE_2}`);
    expect(deleteButton).not.toBeTruthy();
});

test('saving prevented with empty title or too long title', async () =>
{
    //Try saving empty title
    await act(async () => {fireEvent.click(saveButton)});
    let res = component.queryByText("A title is needed for the recipe.");
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);

    //Try saving really long title
    FillRecipe1();
    fireEvent.change(titleInput, {target: {value: "A".repeat(51)}});
    await act(async () => {fireEvent.click(saveButton)});
    res = component.queryByText(/The recipe name is too long!/);
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);
});

test('start reading prevented with empty title', async () =>
{
    //Try saving empty title
    await act(async () => {fireEvent.click(startReadingButton)});
    let res = component.queryByText("A title is needed for the recipe.");
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);

    //Try saving really long title
    FillRecipe1();
    fireEvent.change(titleInput, {target: {value: "A".repeat(51)}});
    await act(async () => {fireEvent.click(saveButton)});
    res = component.queryByText(/The recipe name is too long!/);
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);
});

test('saving prevented with empty ingredients', async () =>
{
    fireEvent.change(titleInput, {target: {value: TEST_TITLE_1}});

    await act(async () => {fireEvent.click(saveButton)});
    let res = component.queryByText("Ingredients are needed for the recipe.");
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);
});

test('start reading prevented with empty ingredients', async () =>
{
    fireEvent.change(titleInput, {target: {value: TEST_TITLE_1}});

    await act(async () => {fireEvent.click(startReadingButton)});
    let res = component.queryByText("Ingredients are needed for the recipe.");
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);
});

test('saving prevented with empty instructions', async () =>
{
    fireEvent.change(titleInput, {target: {value: TEST_TITLE_1}});
    fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_1}});

    await act(async () => {fireEvent.click(saveButton)});
    let res = component.queryByText("Instructions are needed for the recipe.");
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);
});

test('start reading prevented with empty instructions', async () =>
{
    fireEvent.change(titleInput, {target: {value: TEST_TITLE_1}});
    fireEvent.change(ingredientsInput, {target: {value: TEST_INGREDIENTS_1}});

    await act(async () => {fireEvent.click(startReadingButton)});
    let res = component.queryByText("Instructions are needed for the recipe.");
    expect(res).toBeTruthy();
    expect(log).not.toHaveBeenCalledWith(welcomeMessage);
});

test('start reading gives initial instructions', async () =>
{
    FillRecipe1();

    //Press start button
    await act(async () => {fireEvent.click(startReadingButton)});
    expect(log).toHaveBeenLastCalledWith('Welcome! Please say either "ingredients" or "instructions"');

    //Saying repeat last step should do nothing
    await act(async () => {annyang.trigger("repeat last step")});
    expect(log).toHaveBeenLastCalledWith("No instruction has been spoken yet");
});

test('saying "ingredients" reads all ingredients', async () =>
{
    FillRecipe1();

    //Click the start button and say "ingredients"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("ingredients")});
    expect(log).toHaveBeenCalledWith(`You will need the following ingredients for ${TEST_TITLE_1}:`);

    //Check to make sure every ingredient was read
    ExpectAllIngredientsRead(TEST_INGREDIENTS_CONVERTED_1);
});

test('saying "continue ingredients" at the beginning reads all ingredients', async () =>
{
    FillRecipe1();

    //Click the start button and say "ingredients"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("continue ingredients")});
    expect(log).toHaveBeenCalledWith(`You will need the following ingredients for ${TEST_TITLE_1}:`);

    //Check to make sure every ingredient was read
    ExpectAllIngredientsRead(TEST_INGREDIENTS_CONVERTED_1);
});

test('reading list of ingredients with only two items', async () =>
{
    FillRecipe3();

    //Click the start button and say "ingredients"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("ingredients")});

    //Check to make sure they were all read
    let ingredientsList = TEST_INGREDIENTS_CONVERTED_3.split("\n");
    expect(log).toHaveBeenCalledWith(ingredientsList[0]);
    expect(log).toHaveBeenCalledWith("And " + ingredientsList[1]);
});

test('saying "slowly" and then "ingredients" reads all ingredients one at a time', async () =>
{
    FillRecipe1();

    //Click the start button, toggle slow mode, and start reading ingredients
    await act(async () => {fireEvent.click(startReadingButton)});

    //Toggle slow mode
    await act(async () => {annyang.trigger("slowly")});
    expect(log).toHaveBeenLastCalledWith(`Lines will now be read one at a time. To hear the next line, say "next" or "continue".`);

    //Start reading the ingredients and check to make sure the first ingredient was read
    await act(async () => {annyang.trigger("ingredients")});
    let ingredientsList = TEST_INGREDIENTS_CONVERTED_1.split("\n");
    expect(log).toHaveBeenLastCalledWith(ingredientsList[0]);

    //Test repeating the last said phrase
    await act(async () => {annyang.trigger("repeat")});
    expect(log).toHaveBeenLastCalledWith(ingredientsList[0]);

    //Check to make sure the rest of the ingredient list wasn't read
    for (let i = 1; i < ingredientsList.length; ++i)
        expect(log).not.toHaveBeenCalledWith(ingredientsList[i]);

    //Say "next" multiple times and hear the rest of the ingredient list read one at a time
    for (let i = 1; i < ingredientsList.length; ++i)
    {
        await act(async () => {annyang.trigger("next")});

        let ingredient = ingredientsList[i];
        
        if (i + 1 >= ingredientsList.length) //Last ingredient is slightly different
            ingredient = "And finally, " + ingredient;

        expect(log).toHaveBeenLastCalledWith(ingredient);

        //Check to make sure the rest of the ingredient list wasn't read
        for (let j = i + 1; j < ingredientsList.length; ++j)
            expect(log).not.toHaveBeenCalledWith(ingredientsList[j]);
    }
});

test('saying "faster" when "ingredients" are being read slowly should read the rest automatically', async () =>
{
    FillRecipe1();

    //Click the start button, toggle slow mode, and start reading ingredients
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("ingredients");
    });

    //Check to make the first ingredient was read
    let ingredientsList = TEST_INGREDIENTS_CONVERTED_1.split("\n");
    expect(log).toHaveBeenLastCalledWith(ingredientsList[0]);

    //Check to make sure the rest of the ingredient list wasn't read
    for (let i = 1; i < ingredientsList.length; ++i)
        expect(log).not.toHaveBeenCalledWith(ingredientsList[i]);

    //Toggle fast mode
    await act(async () => {annyang.trigger("faster")});

    //Check to make sure every other ingredient was read
    for (let i = 1; i < ingredientsList.length; ++i)
    {
        let ingredient = ingredientsList[i];

        if (i + 1 >= ingredientsList.length) //Last ingredient is slightly different
            ingredient = "And finally, " + ingredient;

        expect(log).toHaveBeenCalledWith(ingredient);
    }
});

test('reading ingredients with sections', async () =>
{
    FillRecipe4();

    //Click the start button and say "ingredients"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("ingredients")});
    expect(log).toHaveBeenCalledWith(`You will need the following ingredients for ${TEST_TITLE_4}:`);

    //Check to make sure every ingredient was read
    ExpectAllIngredientsRead(TEST_INGREDIENTS_CONVERTED_4);
});

test('reading ingredients with sections slowly', async () =>
{
    FillRecipe4();

    //Click the start button, toggle slow mode, and start reading ingredients
    await act(async () => {fireEvent.click(startReadingButton)});

    //Toggle slow mode and start reading the ingredients
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("ingredients");
    });

    //Check to make sure the first section and first ingredient were read
    let ingredientsList = TEST_INGREDIENTS_CONVERTED_4.split("\n");
    expect(log).toHaveBeenCalledWith(ingredientsList[0]);
    expect(log).toHaveBeenLastCalledWith(ingredientsList[1]);

    //Check to make sure the rest of the ingredient list wasn't read
    for (let i = 2; i < ingredientsList.length; ++i)
        expect(log).not.toHaveBeenCalledWith(ingredientsList[i]);

    //Say "next" multiple times and hear the rest of the ingredient list read one at a time
    for (let i = 2; i < ingredientsList.length; ++i)
    {
        await act(async () => {annyang.trigger("next")});

        let ingredient = ingredientsList[i];
        
        if (i + 1 >= ingredientsList.length) //Last ingredient is slightly different
            ingredient = "And finally, " + ingredient;

        if (ingredient.endsWith(":"))
        {
            //Should read the section and immediately the next ingredient
            expect(log).toHaveBeenCalledWith(ingredient);
            expect(log).toHaveBeenLastCalledWith(ingredientsList[i + 1]);
            ++i; //Skip the next ingredient since it was already read
        }

        //Check to make sure the rest of the ingredient list wasn't read
        for (let j = i + 1; j < ingredientsList.length; ++j)
            expect(log).not.toHaveBeenCalledWith(ingredientsList[j]);
    }
});

test('how much of ingredient', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Ask how much of non-existent ingredient
    await act(async () => {annyang.trigger("how much blah")});
    expect(log).toHaveBeenLastCalledWith("blah was not found in the ingredients.");

    //Ask how much of first ingredient in list
    await act(async () => {annyang.trigger("how much flour")});
    expect(log).toHaveBeenLastCalledWith("3 cups (or 360 g) all-purpose flour");

    //Ask how much of last ingredient in list
    await act(async () => {annyang.trigger("how many chocolate chip")}); //Intentionally left out "s" at the end of chips
    expect(log).toHaveBeenLastCalledWith("2 cups chocolate chips");

    //Ask how much of ingredient with multiple matches
    await act(async () => {annyang.trigger("how much sugar")});
    expect(log).toHaveBeenLastCalledWith('There are multiple ingredients with "sugar". 1 cup white sugar, and 1 cup brown sugar');

    //Ask how much of ingredient who's word is partially in another word
    await act(async () => {annyang.trigger("how much salt")});
    expect(log).toHaveBeenLastCalledWith("1 tsp sea salt");


    //Change to recipe 2
    FillRecipe2();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Ask how much of partial word
    await act(async () => {annyang.trigger("how much hips")});
    expect(log).toHaveBeenLastCalledWith("hips was not found in the ingredients.");

    //Ask how much of oil should only return oil and not "boiling water"
    await act(async () => {annyang.trigger("how much oil")});
    expect(log).toHaveBeenLastCalledWith("4 tbsp oil");

    //Ask how much of oils should accurately match to oil
    await act(async () => {annyang.trigger("how much oils")});
    expect(log).toHaveBeenLastCalledWith("4 tbsp oil");

    //Ask how much of boiling water
    await act(async () => {annyang.trigger("how much boiling water")});
    expect(log).toHaveBeenLastCalledWith("2 cups boiling water");

    //Ask how much of boiling waters
    await act(async () => {annyang.trigger("how much boiling waters")});
    expect(log).toHaveBeenLastCalledWith("2 cups boiling water");

    //Ask how much of chip (instead of chips)
    await act(async () => {annyang.trigger("how much chip")});
    expect(log).toHaveBeenLastCalledWith("1 bag of chips");


    //Change to recipe 4
    FillRecipe4();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Ask how much of section name
    await act(async () => {annyang.trigger("how much section")});
    expect(log).toHaveBeenLastCalledWith("section was not found in the ingredients.");

    //Ask how much of general ingredient
    await act(async () => {annyang.trigger("how much ingredient 1")});
    expect(log).toHaveBeenLastCalledWith("ingredient 1");

    //Ask how much of ingredient with multiple matches
    await act(async () => {annyang.trigger("how much ingredient")});
    expect(log).toHaveBeenLastCalledWith(`There are multiple ingredients with "ingredient". `
                                       + `for section 1, ingredient 1. `
                                       + `for section 1, ingredient 2. `
                                       + `for section 2, ingredient 3. and `
                                       + `for section 2, ingredient 4`);


    //Change to recipe 5
    FillRecipe5();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Ask how much of section name that's also ingredient
    await act(async () => {annyang.trigger("how much tofu")});
    expect(log).toHaveBeenLastCalledWith("1 16 ounce block of firm or extra firm tofu, pressed, and torn into 1 to 2 inch pieces");
});

test('saying "instructions" reads all instructions', async () =>
{
    FillRecipe1();

    //Click the start button and say "instructions"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("instructions")});
    expect(log).toHaveBeenCalledWith(`You will need to follow these steps for ${TEST_TITLE_1}:`);

    //Check to make sure every instruction part was read
    let instructionsList = TEST_INSTRUCTIONS_CONVERTED_1.split("\n");
    for (let instruction of instructionsList)
        expect(log).toHaveBeenCalledWith(instruction);
});

test('saying "continue instructions" at the beginning reads all instructions', async () =>
{
    FillRecipe1();

    //Click the start button and say "instructions"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("continue instructions")});
    expect(log).toHaveBeenCalledWith(`You will need to follow these steps for ${TEST_TITLE_1}:`);

    //Check to make sure every instruction part was read
    let instructionsList = TEST_INSTRUCTIONS_CONVERTED_1.split("\n");
    for (let instruction of instructionsList)
        expect(log).toHaveBeenCalledWith(instruction);
});

test('saying "read from step X" reads all instructions from that step only', async () =>
{
    FillRecipe1();

    //Click the start button and say "instructions"
    await act(async () => {fireEvent.click(startReadingButton)});

    //Read too small step
    await act(async () => {annyang.trigger("read from step 0")});
    expect(log).toHaveBeenLastCalledWith(`"0" is not a valid step number`);

    //Read too large step
    await act(async () => {annyang.trigger("read from step 100")});
    expect(log).toHaveBeenLastCalledWith(`"100" is not a valid step number`);

    //Read non existent word step
    await act(async () => {annyang.trigger("read from step blah")});
    expect(log).toHaveBeenLastCalledWith(`"blah" is not a valid step number`);

    //Read from step 3
    await act(async () => {annyang.trigger("read from step 3")});

    let checkRead = false;
    for (let instruction of TEST_INSTRUCTIONS_CONVERTED_1.split("\n"))
    {
        if (instruction.startsWith("Step 3."))
            checkRead = true; //Should have read all steps afterf this point

        if (checkRead) //Check to make sure every instruction from step 3 was read
            expect(log).toHaveBeenCalledWith(instruction);
        else //Check to make sure steps 1 and 2 were not read
            expect(log).not.toHaveBeenCalledWith(instruction);
    }
});

test('saying "slowly" and then "instructions" reads all instructions one at a time', async () =>
{
    FillRecipe1();

    //Click the start button, toggle slow mode, and start reading instructions
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("instructions");
    });

    //Check to make the first instruction was read
    let instructionsList = TEST_INSTRUCTIONS_CONVERTED_1.split("\n");
    expect(log).toHaveBeenLastCalledWith(instructionsList[0]);

    //Check to make sure the rest of the instruction list wasn't read
    for (let i = 1; i < instructionsList.length; ++i)
        expect(log).not.toHaveBeenCalledWith(instructionsList[i]);

    //Check saying "repeat" doesn't cause a "continue instructions" afterwards
    await act(async () => {annyang.trigger("repeat")});
    await act(async () => {annyang.trigger("repeat last step")});

    //Say "next" multiple times and hear the rest of the instruction list read one at a time
    for (let i = 1; i < instructionsList.length; ++i)
    {
        await act(async () => {annyang.trigger("next")});
        expect(log).toHaveBeenLastCalledWith(instructionsList[i]);

        //Check to make sure the rest of the instructionsList list wasn't read
        for (let j = i + 1; j < instructionsList.length; ++j)
            expect(log).not.toHaveBeenCalledWith(instructionsList[j]);
    }
});

test('intrrupting slow "instructions" with ingredients still finishes instructions properly', async () =>
{
    FillRecipe1();

    //Click the start button, toggle slow mode, and start reading instructions
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("instructions"); //Read instruction line 1
    });

    //Side tangent asking about an ingredient
    await act(async () => {annyang.trigger("how much vanilla")});
    expect(log).toHaveBeenLastCalledWith("2 tsp vanilla extract");

    //Read instruction line 2
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith("Continuing step 1. line a baking pan with parchment paper and set aside");

    //Side tangent asking about an ingredient
    await act(async () => {annyang.trigger("how many eggs")});
    expect(log).toHaveBeenLastCalledWith("2 large eggs");

    //Read instruction line 3
    await act(async () => {annyang.trigger("next")});
    let lastStep = "Step 2. in a separate bowl mix 3 cups (or 360 g) all-purpose flour";
    expect(log).toHaveBeenLastCalledWith(lastStep);

    //Test repeating the last said phrase
    await act(async () => {annyang.trigger("repeat")});
    expect(log).toHaveBeenLastCalledWith(lastStep);

    //Test repeating the last step said
    await act(async () => {annyang.trigger("repeat last step")});
    expect(log).toHaveBeenLastCalledWith((lastStep));

    //Read entire ingredients list
    await act(async () => {annyang.trigger("ingredients")});

    //Check to make the first ingredient was read
    let ingredientsList = TEST_INGREDIENTS_CONVERTED_1.split("\n");
    expect(log).toHaveBeenLastCalledWith(ingredientsList[0]);

    //Side tangent asking about an ingredient
    await act(async () => {annyang.trigger("how much butter")});
    expect(log).toHaveBeenLastCalledWith("227 g unsalted butter");
    
    //Test repeating the last said phrase
    await act(async () => {annyang.trigger("repeat")});
    expect(log).toHaveBeenLastCalledWith("227 g unsalted butter");

    //Test repeating the last step said
    await act(async () => {annyang.trigger("repeat last step")});
    expect(log).toHaveBeenLastCalledWith("Step 2. in a separate bowl mix 3 cups (or 360 g) all-purpose flour");

    //Check to make sure a specific command must be given to continue reading ingredients
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith('Please say either "continue ingredients" or "continue instructions".');

    //Read second ingredient in ingredients list
    await act(async () => {annyang.trigger("continue ingredients")});
    expect(log).toHaveBeenLastCalledWith(ingredientsList[1]);

    //Check to make sure the rest of the ingredients can be read with just next
    for (let i = 2; i < ingredientsList.length; ++i)
    {
        await act(async () => {annyang.trigger("next")});

        let ingredient = ingredientsList[i];

        if (i + 1 >= ingredientsList.length) //Last ingredient is slightly different
            ingredient = "And finally, " + ingredient;

        expect(log).toHaveBeenLastCalledWith(ingredient);
    }

    //Check to make sure a specific command must be given to continue from here
    for (let i = 0; i < 2; ++i) //Check twice because after first time a "next" is EXPECTED, while after a second time it's not
    {
        await act(async () => {annyang.trigger("next")});
        expect(log).toHaveBeenLastCalledWith('To continue the instructions, say "continue instructions".');
    }

    //Read instruction line 4
    await act(async () => {annyang.trigger("continue instructions")});
    expect(log).toHaveBeenLastCalledWith("Continuing step 2. 1 tsp baking soda");

    //Read instruction line 5
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith("1 tsp sea salt");
});

test('reading instructions with ingredient sections', async () =>
{
    FillRecipe4();

    //Click the start button and say "instructions"
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("instructions")});
    expect(log).toHaveBeenCalledWith(`You will need to follow these steps for ${TEST_TITLE_4}:`);

    //Check to make sure every instruction part was read and ingredients were substituted correctly
    let instructionsList = TEST_INSTRUCTIONS_4_CONVERTED.split("\n");
    for (let instruction of instructionsList)
        expect(log).toHaveBeenCalledWith(instruction);
});

test('reading practical instructions with ingredient sections', async () =>
{
    FillRecipe5();

    //Click the start button and start reading instructions slowly
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("instructions"); //Read instruction line 1
    });

    //Check to make sure every instruction part was read and ingredients were substituted correctly
    let instructionsList = TEST_INSTRUCTIONS_5_CONVERTED.split("\n");

    expect(log).toHaveBeenCalledWith(`You will need to follow these steps for ${TEST_TITLE_5}:`);
    expect(log).toHaveBeenLastCalledWith(instructionsList[0]);

    //Say "next" multiple times and hear the rest of the instruction list read one at a time
    for (let i = 1; i < instructionsList.length; ++i)
    {
        await act(async () => {annyang.trigger("next")});
        expect(log).toHaveBeenLastCalledWith(instructionsList[i]);
    }
});

test('repeat specific instruction', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Try read fake step
    await act(async () => {annyang.trigger("read step blah")}); //Intentionally "read" here and not "repeat" for the coverage
    expect(log).toHaveBeenLastCalledWith(`"blah" is not a valid step number.`);

    //Read step 4
    await act(async () => {annyang.trigger("repeat step four")}); //Intentionally written as "four" here

    //Check step 4 was all read in one go
    let continueStep = 'That is the end of step 4. To continue from where you left off, say \"continue instructions\". To continue from the next step, say \"read from step 5\".';
    expect(log).toHaveBeenCalledWith("Step 4. beat in 2 large eggs");
    expect(log).toHaveBeenCalledWith("2 tsp vanilla extract");
    expect(log).toHaveBeenCalledWith("and 2 tsp peppermint extract until fluffy");
    expect(log).toHaveBeenLastCalledWith(continueStep);

    //Check saying next just repeats the continue command
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith(continueStep);
});

test('repeat specific instruction slowly', async () =>
{
    FillRecipe1();

    //Click the start button, toggle slow mode, and read step 4
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("repeat step 4"); //Intentionally written as "4"
    });

    let step4 = ["Step 4. beat in 2 large eggs",
                 "2 tsp vanilla extract",
                 "and 2 tsp peppermint extract until fluffy",
                 'That is the end of step 4. To continue from where you left off, say "continue instructions". To continue from the next step, say "read from step 5".'];

    //Check only the first part of step 4 was read
    expect(log).toHaveBeenLastCalledWith(step4[0]);

    //Check the rest of step 4 is read after nexts
    for (let stepPart of step4.slice(1))
    {
        await act(async () => {annyang.trigger("next")});
        expect(log).toHaveBeenLastCalledWith(stepPart);
    }

    //Check saying next just repeats the continue command
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith(step4[step4.length - 1]);
});

test('read instructions and repeat a specific one in the middle', async () =>
{
    FillRecipe1();

    //Click the start button, toggle slow mode, and start reading instructions
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("instructions"); //Read instruction line 1
    });

    //Interject and check only the first part of step 3 was read
    let step3 = ["Step 3. in the mixing bowl, cream together 227 g unsalted butter",
                 "1 cup white sugar",
                 "Continuing step 3. and 1 cup brown sugar until combined",
                 'That is the end of step 3. To continue from where you left off, say "continue instructions". To continue from the next step, say "read from step 4".'];

    await act(async () => {annyang.trigger("repeat step three")});
    expect(log).toHaveBeenLastCalledWith(step3[0]);

    //Say next and get the second part of step 3
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith(step3[1]);

    //Side-tangent asking for ingredient
    await act(async () => {annyang.trigger("how much white sugar")});
    expect(log).toHaveBeenLastCalledWith("1 cup white sugar");

    //Continue and finish step 3
    for (let step of step3.slice(2))
    {
        await act(async () => {annyang.trigger("next")});
        expect(log).toHaveBeenLastCalledWith(step);
    }

    //Say next again and get the continue command again
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith(step3[step3.length - 1]);

    //Say the special continue step command and get the same result as before
    await act(async () => {annyang.trigger("continue repeating step")});
    expect(log).toHaveBeenLastCalledWith(step3[step3.length - 1]);

    //Continue reading instructions from where left off before
    await act(async () => {annyang.trigger("continue instructions")});
    expect(log).toHaveBeenLastCalledWith("Continuing step 1. line a baking pan with parchment paper and set aside");

    //Continue reading instructions as normal
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith("Step 2. in a separate bowl mix 3 cups (or 360 g) all-purpose flour");
});

test('read instructions, repeat a specific one in the middle, then read ingredients during that specific one', async () =>
{
    const readEntireIngredientsList = async () =>
    {
        let ingredientsList = TEST_INGREDIENTS_CONVERTED_1.split("\n");
        await act(async () => {annyang.trigger("ingredients")});
        for (let i = 1; i < ingredientsList.length; ++i)
            await act(async () => {annyang.trigger("next")});
    }

    FillRecipe1();

    //Click the start button and toggle slow mode
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("slowly")});

    //Read first line of step 4
    await act(async () => {annyang.trigger("repeat step 4")});

    //Read entire ingredients list and get the continue command
    await readEntireIngredientsList();
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith(`To continue reading just step 4, say "continue repeating step".`);

    //Try the continue command for step 4
    await act(async () => {annyang.trigger("continue repeating step")});
    expect(log).toHaveBeenLastCalledWith(`Continuing step 4. 2 tsp vanilla extract`);

    //Start reading the istructions
    await act(async () => {annyang.trigger("instructions")}); //Read instruction line 1

    //Try continuing step that should no longer be continuable
    await act(async () => {annyang.trigger("continue repeating step")});
    expect(log).toHaveBeenLastCalledWith(`No step is currently being repeated. To read a specific step, say something like "repeat step 2".`);

    //Read first line of step 2
    await act(async () => {annyang.trigger("repeat step two")});

    //Read entire ingredients list and get the continue command
    await readEntireIngredientsList();
    await act(async () => {annyang.trigger("next")});
    expect(log).toHaveBeenLastCalledWith(`To continue repeating step 2, say "continue repeating step".`
                                        + ` To continue the instructions from step 1, say "continue instructions".`);

    //Continue repeating step 2
    await act(async () => {annyang.trigger("continue repeating step")});
    expect(log).toHaveBeenLastCalledWith("Continuing step 2. 1 tsp baking soda");
});

test('skip step', async () =>
{
    FillRecipe1();

    //Click the start button and toggle slow mode
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("slowly")});

    //Confirm skipping step does nothing now
    await act(async () => {annyang.trigger("skip step")});
    expect(log).toHaveBeenLastCalledWith(`Lines will now be read one at a time. To hear the next line, say "next" or "continue".`);

    //Start reading instructions then skip the rest of the step
    await act(async () => {annyang.trigger("instructions")}); //Read instruction line 1
    await act(async () => {annyang.trigger("skip step")});
    expect(log).toHaveBeenLastCalledWith("Step 2. in a separate bowl mix 3 cups (or 360 g) all-purpose flour");

    //Toggle fast mode and read rest of instructions
    await act(async () => {annyang.trigger("faster")});
    await act(async () => {annyang.trigger("next")});
    let doneStep = `You've reached the end of the instructions for ${TEST_TITLE_1}!`;
    expect(log).toHaveBeenLastCalledWith(doneStep);

    //Trying to skip step should do nothing
    await act(async () => {annyang.trigger("skip step")});
    expect(log).toHaveBeenLastCalledWith(doneStep);
});

test('which step am I on', async () =>
{
    FillRecipe1();

    //Click the start button and confirm no instructions have been started
    await act(async () => {fireEvent.click(startReadingButton)});
    await act(async () => {annyang.trigger("current step")});
    expect(log).toHaveBeenLastCalledWith(`The instructions for ${TEST_TITLE_1} have not been started. To read the instructions, say "instructions".`);

    //Toggle slow mode, and start reading instructions
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("instructions"); //Read instruction line 1
    });

    await act(async () => {annyang.trigger("current step")});
    expect(log).toHaveBeenLastCalledWith(`Currently reading step 1 of ${TEST_TITLE_1}.`);

    //Side tangent off to specific step
    await act(async () => {annyang.trigger("repeat step 3")});
    await act(async () => {annyang.trigger("current step")});
    expect(log).toHaveBeenLastCalledWith(`Currently repeating step 3 of ${TEST_TITLE_1}. And currently paused reading step 1.`);

    //Continue reading instructions from where left off before
    await act(async () => {annyang.trigger("continue instructions")});
    await act(async () => {annyang.trigger("current step")});
    expect(log).toHaveBeenLastCalledWith(`Currently reading step 1 of ${TEST_TITLE_1}.`); //Should still be step 1 because step 2 has not been started yet

    //Toggle fast mode
    await act(async () => {annyang.trigger("faster")});
    expect(log).toHaveBeenLastCalledWith("Lines will now be read all at once.");

    //Finish the instructions
    await act(async () => {annyang.trigger("next")});
    await act(async () => {annyang.trigger("current step")});
    expect(log).toHaveBeenLastCalledWith(`The instructions for ${TEST_TITLE_1} are finished.`);
});

test('which step has the word', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Search for "blah" and get no result
    await act(async () => {annyang.trigger("which step has the word blah")});
    expect(log).toHaveBeenLastCalledWith(`No step was found with the phrase "blah".`);

    //Search for "preheat" and get one step
    await act(async () => {annyang.trigger("which step has the word preheat")});
    expect(log).toHaveBeenLastCalledWith(`Step 1 contains the phrase "preheat".`);

    //Search for "oven" and get two steps
    await act(async () => {annyang.trigger("which step has the word oven")});
    expect(log).toHaveBeenLastCalledWith(`Steps 1 and 8 both contain the phrase "oven".`);

    //Search for "until" and get three steps
    await act(async () => {annyang.trigger("which step has the word until")});
    expect(log).toHaveBeenLastCalledWith(`Steps 3, 4, and 5 contain the phrase "until".`);

    //Search for "egg" and get one step
    await act(async () => {annyang.trigger("which step has the word egg")});
    expect(log).toHaveBeenLastCalledWith(`Step 4 contains the phrase "egg".`);

    //Search for "sugars" and get one step (despite being found multiple times in the same step)
    await act(async () => {annyang.trigger("which step has the word sugars")});
    expect(log).toHaveBeenLastCalledWith(`Step 3 contains the phrase "sugars".`);

    //Search for "set aside" and get two steps
    await act(async () => {annyang.trigger("which step has the word set aside")});
    expect(log).toHaveBeenLastCalledWith(`Steps 1 and 2 both contain the phrase "set aside".`);

    //Search for entire step and get it back
    let step5 = "Mix in the dry ingredients until combined"; //Intentionally capitalized M in Mix
    await act(async () => {annyang.trigger(`which step has the word ${step5}`)});
    expect(log).toHaveBeenLastCalledWith(`Step 5 contains the phrase "${step5.toLowerCase()}".`);
});

test('recipe switching', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Say current recipe
    await act(async () => {annyang.trigger("what's cooking")});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_1}.`);

    //Toggle slow mode, and start reading instructions
    await act(async () =>
    {
        annyang.trigger("slowly");
        annyang.trigger("instructions"); //Read instruction line 1
    });

    //Try switching to non-existent recipe
    await act(async () => {annyang.trigger("switch to blah")});
    expect(log).toHaveBeenLastCalledWith(`No recipes were found for "blah".`);

    //Try switching to current recipe
    await act(async () => {annyang.trigger(`switch to ${TEST_TITLE_1}`)});
    expect(log).toHaveBeenLastCalledWith(`You're already cooking ${TEST_TITLE_1}.`);

    //Wipe and add a second recipe
    await act(async () => {fireEvent.click(newRecipeButton)});
    FillRecipe2();
    await act(async () => {fireEvent.click(saveButton)});
    
    //Say current recipe
    await act(async () => {annyang.trigger("current recipe")});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_2}.`);

    //Switch back to first recipe
    await act(async () => {annyang.trigger(`switch to ${TEST_TITLE_1}`)});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_1}.`);

    //Wipe and add a third recipe
    await act(async () => {fireEvent.click(newRecipeButton)});
    FillRecipe3();
    await act(async () => {fireEvent.click(saveButton)});

    //Switch back to first recipe
    await act(async () => {annyang.trigger(`switch to ${TEST_TITLE_1}`)});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_1}.`);

    //Try switching to recipe that should give multiple options
    await act(async () => {annyang.trigger(`switch to test`)});
    expect(log).toHaveBeenLastCalledWith(`Multiple recipes contain the phrase "test". Which of these did you mean? ${TEST_TITLE_2}. ${TEST_TITLE_3}.`);

    //Switch to second recipe
    await act(async () => {annyang.trigger(`switch to ${TEST_TITLE_2}`)});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_2}.`);

    //Switch to third recipe successfully using a common phrase bewteen recipe 2 and 3
    await act(async () => {annyang.trigger(`switch to dummy`)});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_3}.`);

    //Say current recipe
    await act(async () => {annyang.trigger("which recipe")});
    expect(log).toHaveBeenLastCalledWith(`Now cooking ${TEST_TITLE_3}.`);

    //Toggle fast-mode and start reading instructions for recipe 3
    await act(async () =>
    {
        annyang.trigger("faster");
        annyang.trigger("instructions"); //Read instruction line 1
    });

    for (let instruction of TEST_INSTRUCTIONS_3_CONVERTED.split("\n"))
        expect(log).toHaveBeenCalledWith(instruction);
});

test('setting seconds timer', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start a 2 second timer
    let timerName1 = "test two seconds";
    await act(async () => {annyang.trigger(`start set a timer for two seconds named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName1}" lasting 2 seconds.`);

    //Start a 1 second timer
    let timerName2 = "test one second";
    await act(async () => {annyang.trigger(`start set a timer for 1 second named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName2}" lasting 1 second.`);

    //Start an already existing timer
    await act(async () => {annyang.trigger(`start set a timer for 1 second named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`There is already an active timer for "${timerName2}".`);

    //Wait for the 1 second timer to finish
    await sleep(1100);
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" is done.`);

    //Wait for the 2 second timer to finish
    await sleep(1000);
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" is done.`);
});

test('setting minutes timer', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start a 1 minute timer
    let timerName1 = "test one minute";
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName1}" lasting 1 minute.`);

    //Start a 2 minute timer
    let timerName2 = "test two minutes";
    await act(async () => {annyang.trigger(`start set a timer for two minutes named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName2}" lasting 2 minutes.`);

    //Start a 90 second timer
    let timerName3 = "test 90 seconds";
    await act(async () => {annyang.trigger(`start set a timer for ninety seconds named called ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName3}" lasting 1 minute, 30 seconds.`);

    //Wait for a little over 1 second and make sure the timers properly updated
    await sleep(1100);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" has 1 minute, 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName3}" has 1 minute, 29 seconds remaining.`);
});

test('setting hours timer', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start a 1 hour timer
    let timerName1 = "test one hour";
    await act(async () => {annyang.trigger(`start set a timer for 1 hour named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName1}" lasting 1 hour.`);

    //Start a 2 hour timer
    let timerName2 = "test two hours";
    await act(async () => {annyang.trigger(`start set a timer for two hours named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName2}" lasting 2 hours.`);

    //Star a timer with too many hours
    let timerName3 = "test 100 hours";
    await act(async () => {annyang.trigger(`start set a timer for 100 hours named called ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`100 is not a valid hour to set for the timer. It must be greater than 0 and up to 24.`);

    //Wait for a little over 1 second and make sure the timers properly updated
    await sleep(1100);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 59 minutes, 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" has 1 hour, 59 minutes, 59 seconds remaining.`);
});

test('setting hours-minutes timer', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start a 1 hour 70 minutes timer
    let badTimerName = "test 1 hour 70 minutes";
    await act(async () => {annyang.trigger(`start set a timer for 1 hour and 70 minutes named called ${badTimerName}`)});
    expect(log).toHaveBeenLastCalledWith(`70 is not a valid minute to set for the timer. It must be greater than 0 and up to 59.`);

    //Start a 1 hour 30 minutes timer
    let timerName1 = "test 1 hour 30 minutes";
    await act(async () => {annyang.trigger(`start set a timer for 1 hour and 30 minutes named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName1}" lasting 1 hour, 30 minutes.`);

    //Start a 1 and a half hours timer
    let timerName2 = "test 1 and a half hours";
    await act(async () => {annyang.trigger(`start set a timer for 1 and a half hours named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName2}" lasting 1 hour, 30 minutes.`);

    //Start a 1 hour and a half timer
    let timerName3 = "test 1 a half hours";
    await act(async () => {annyang.trigger(`start set a timer for 1 hour and a half named called ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName3}" lasting 1 hour, 30 minutes.`);

    //Start an hour and a half timer
    let timerName4 = "test an hour and a half";
    await act(async () => {annyang.trigger(`start set a timer for an hour and a half named called ${timerName4}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName4}" lasting 1 hour, 30 minutes.`);

    //Start a 90 minute timer
    let timerName5 = "test 90 minutes";
    await act(async () => {annyang.trigger(`start set a timer for 90 minutes named called ${timerName5}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName5}" lasting 1 hour, 30 minutes.`);

    //Wait for a little over 1 second and make sure the timers properly updated
    await sleep(1100);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 1 hour, 29 minutes, 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" has 1 hour, 29 minutes, 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName3}" has 1 hour, 29 minutes, 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName4}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName4}" has 1 hour, 29 minutes, 59 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName5}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName5}" has 1 hour, 29 minutes, 59 seconds remaining.`);

    //Wait for a little over another second and make sure the timer properly updated again
    await sleep(1100);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 1 hour, 29 minutes, 58 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" has 1 hour, 29 minutes, 58 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName3}" has 1 hour, 29 minutes, 58 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName4}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName4}" has 1 hour, 29 minutes, 58 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName5}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName5}" has 1 hour, 29 minutes, 58 seconds remaining.`);
});

test('setting minutes-seconds timer', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start a 1 minute 70 seconds timer
    let badTimerName = "test 1 minute 70 seconds";
    await act(async () => {annyang.trigger(`start set a timer for 1 minute and 70 seconds named called ${badTimerName}`)});
    expect(log).toHaveBeenLastCalledWith(`70 is not a valid second to set for the timer. It must be greater than 0 and up to 59.`);

    //Start a 1 minute 30 seconds timer
    let timerName1 = "test 1 minute 30 seconds";
    await act(async () => {annyang.trigger(`start set a timer for 1 minute and 30 seconds named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName1}" lasting 1 minute, 30 seconds.`);

    //Start a 1 and a half minutes timer
    let timerName2 = "test 1 and a half minutes";
    await act(async () => {annyang.trigger(`start set a timer for 1 and a half minutes named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName2}" lasting 1 minute, 30 seconds.`);

    //Start a 1 minute and a half timer
    let timerName3 = "test 1 a half minutes";
    await act(async () => {annyang.trigger(`start set a timer for 1 minute and a half named called ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName3}" lasting 1 minute, 30 seconds.`);

    //Start an minute and a half timer
    let timerName4 = "test a minute and a half";
    await act(async () => {annyang.trigger(`start set a timer for a minute and a half named called ${timerName4}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName4}" lasting 1 minute, 30 seconds.`);

    //Start a 90 second timer
    let timerName5 = "test 90 seconds";
    await act(async () => {annyang.trigger(`start set a timer for 90 seconds named called ${timerName5}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName5}" lasting 1 minute, 30 seconds.`);

    //Start a 1 hour 1 second timer
    let timerName6 = "test 3601 seconds"
    await act(async () => {annyang.trigger(`start set a timer for 3601 seconds named called ${timerName6}`)});
    expect(log).toHaveBeenLastCalledWith(`Started a timer called "${timerName6}" lasting 1 hour, 1 second.`);

    //Wait for a little over 1 second and make sure the timers properly updated
    await sleep(1100);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 1 minute, 29 seconds remaining.`);
    
    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" has 1 minute, 29 seconds remaining.`);
    
    await act(async () => {annyang.trigger(`how much time left on ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName3}" has 1 minute, 29 seconds remaining.`);
    
    await act(async () => {annyang.trigger(`how much time left on ${timerName4}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName4}" has 1 minute, 29 seconds remaining.`);
    
    await act(async () => {annyang.trigger(`how much time left on ${timerName5}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName5}" has 1 minute, 29 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName6}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName6}" has 1 hour remaining.`);

    //Wait for a little over another second and make sure the timer properly updated again
    await sleep(1100);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 1 minute, 28 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" has 1 minute, 28 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName3}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName3}" has 1 minute, 28 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName4}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName4}" has 1 minute, 28 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName5}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName5}" has 1 minute, 28 seconds remaining.`);

    await act(async () => {annyang.trigger(`how much time left on ${timerName6}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName6}" has 59 minutes, 59 seconds remaining.`);
});

test('pausing timer', async () =>
{
    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start a 5 second timer
    let timerName2 = "test 2 seconds";
    await act(async () => {annyang.trigger(`start set a timer for 2 seconds named called ${timerName2}`)});

    //Start a 1 minute timer
    let timerName1 = "test one minute";
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});

    //Make sure a non-existent timer can't be pause
    await act(async () => {annyang.trigger(`pause timer named called fake`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "fake" was found.`);

    //Wait a little and pause the timer
    await sleep(250);
    await act(async () => {annyang.trigger(`pause timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" was paused with 1 minute remaining.`);

    //Make sure the timer can't be paused again
    await act(async () => {annyang.trigger(`pause timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" is already paused at 1 minute remaining.`);

    //Make sure a non-existent timer can't be unpaused
    await act(async () => {annyang.trigger(`continue timer named called fake`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "fake" was found.`);

    //Check error message when trying to start a timer with the same name as a paused timer
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`There is already a timer for "${timerName1}" paused at 1 minute remaining.`);

    //Wait a second and unpause the timer
    await sleep(1000);
    await act(async () => {annyang.trigger(`continue timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" was resumed with 1 minute remaining.`);

    //Make sure the timer can't be unpaused again
    await act(async () => {annyang.trigger(`resume timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" is already running with 1 minute remaining.`);

    //Wait a second and make sure the time was updated correctly
    await sleep(1000);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 59 seconds remaining.`);

    //Check to make sure the pausing had no effect on the other timer set
    await act(async () => {annyang.trigger(`how much time left on ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" finished already.`);

    //Try pausing and resuming a finished timer
    await act(async () => {annyang.trigger(`pause timer named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" finished already.`);

    await act(async () => {annyang.trigger(`resume timer named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" finished already.`);

    //Pause the timer again
    await act(async () => {annyang.trigger(`pause timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" was paused with 59 seconds remaining.`);

    //Wait a second and unpause the timer
    await sleep(1000);
    await act(async () => {annyang.trigger(`continue timer named called ${timerName1}`)});

    //Wait a second and make sure the pause times were calculated correctly
    await sleep(1000);
    await act(async () => {annyang.trigger(`how much time left on ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" has 58 seconds remaining.`);
});

test('stop timer', async () =>
{
    let timerName1 = "test timer 1";
    let timerName2 = "test timer 2";

    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start test timer 1
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});

    //Make sure a non-existent timer can't be stopped
    await act(async () => {annyang.trigger(`stop timer named called fake`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "fake" was found.`);

    //Stop the timer
    await act(async () => {annyang.trigger(`stop timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" was removed.`);

    //Make sure the timer can't be stopped again
    await act(async () => {annyang.trigger(`stop timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "${timerName1}" was found.`);

    //Start the timer again alongside a second timer
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName2}`)});

    //Make sure a non-existent timer can't be cancelled
    await act(async () => {annyang.trigger(`cancel timer named called fake`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "fake" was found.`);

    //Cancel the timer
    await act(async () => {annyang.trigger(`cancel timer named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" was removed.`);

    //List remaining timers and make sure only timer 1 is left
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenLastCalledWith(`0. The timer for "${timerName1}" has 1 minute remaining.`);

    //Start timer 2 again
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName2}`)});

    //Stop all timers
    await act(async () => {annyang.trigger(`stop all timers`)});
    expect(log).toHaveBeenLastCalledWith(`All timers were removed.`);

    //Try stopping all timers when none are active
    await act(async () => {annyang.trigger(`cancel all timers`)});
    expect(log).toHaveBeenLastCalledWith(`No timers are currently active.`);

    //Read all timers and make sure none are left
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenLastCalledWith(`No timers are currently active.`);
});

test('reading all timers single timer', async () =>
{
    let timerName1 = "test timer 1";

    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Read specific timer with fake name
    await act(async () => {annyang.trigger(`how much time left on fake`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "fake" was found.`);

    //Read timers when none are active
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenLastCalledWith(`No timers are currently active.`);

    //Start test timer 1
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});
    
    //Read all timers
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenLastCalledWith(`0. The timer for "${timerName1}" has 1 minute remaining.`);
});

test('reading all timers two timers', async () =>
{
    let timerName1 = "test timer 1";
    let timerName2 = "test timer 2";

    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start test timers
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});
    await act(async () => {annyang.trigger(`start set a timer for 2 seconds named called ${timerName2}`)});

    //Read all timers (should be sorted in order from closest to finishing to furthest)
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenCalledWith(`0. The timer for "${timerName2}" has 2 seconds remaining.`);
    expect(log).toHaveBeenLastCalledWith(`1. The timer for "${timerName1}" has 1 minute remaining.`);

    //Wait 2 seconds
    await sleep(2200);

    //Read all timers (finished timers should be sorted to the end)
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenLastCalledWith(`1. The timer for "${timerName2}" finished already.`);
});

test('reading all timers multiple timers', async () =>
{
    let timerName1 = "test timer 1";
    let timerName2 = "test timer 2";
    let timerName3 = "b test timer 3";
    let timerName4 = "a test timer 4";

    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Start test timers
    await act(async () => {annyang.trigger(`start set a timer for 1 hour named called ${timerName1}`)});
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName2}`)});
    await act(async () => {annyang.trigger(`start set a timer for 2 seconds named called ${timerName3}`)});
    await act(async () => {annyang.trigger(`start set a timer for 1 second named called ${timerName4}`)});
    
    //Read all timers (should be sorted in order from closest to finishing to furthest)
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenCalledWith(`0. The timer for "${timerName4}" has 1 second remaining.`);
    expect(log).toHaveBeenCalledWith(`1. The timer for "${timerName3}" has 2 seconds remaining.`);
    expect(log).toHaveBeenCalledWith(`2. The timer for "${timerName2}" has 1 minute remaining.`);
    expect(log).toHaveBeenLastCalledWith(`3. The timer for "${timerName1}" has 1 hour remaining.`);

    //Wait 1 second
    await sleep(1100);

    //Read all timers (should be sorted in order from closest to finishing to furthest)
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenCalledWith(`0. The timer for "${timerName3}" has 1 second remaining.`);
    expect(log).toHaveBeenCalledWith(`1. The timer for "${timerName2}" has 59 seconds remaining.`);
    expect(log).toHaveBeenCalledWith(`2. The timer for "${timerName1}" has 59 minutes, 59 seconds remaining.`);
    expect(log).toHaveBeenLastCalledWith(`3. The timer for "${timerName4}" finished already.`);

    //Wait 1 second
    await sleep(1100);

    //Read all timers (the finished timers should be sorted in alphabetical order)
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenCalledWith(`0. The timer for "${timerName2}" has 58 seconds remaining.`);
    expect(log).toHaveBeenCalledWith(`1. The timer for "${timerName1}" has 59 minutes, 58 seconds remaining.`);
    expect(log).toHaveBeenCalledWith(`2. The timer for "${timerName4}" finished already.`);
    expect(log).toHaveBeenLastCalledWith(`3. The timer for "${timerName3}" finished already.`);
});

test('restarting timers', async () =>
{
    let timerName1 = "test timer 1";
    let timerName2 = "test timer 2";

    FillRecipe1();

    //Click the start button
    await act(async () => {fireEvent.click(startReadingButton)});

    //Try restarting non-existent timer
    await act(async () => {annyang.trigger(`restart timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`No timer with the name "${timerName1}" was found.`);

    //Start test timers
    await act(async () => {annyang.trigger(`start set a timer for 1 minute named called ${timerName1}`)});
    await act(async () => {annyang.trigger(`start set a timer for 1 second named called ${timerName2}`)});

    //Wait 1 seconds
    await sleep(1100);

    //Restart the finished timer
    await act(async () => {annyang.trigger(`restart timer named called ${timerName2}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName2}" was restarted to 1 second remaining.`);

    //Restart the unfinished timer
    await act(async () => {annyang.trigger(`restart timer named called ${timerName1}`)});
    expect(log).toHaveBeenLastCalledWith(`The timer for "${timerName1}" was restarted to 1 minute remaining.`);

    //Wait 1 second
    await sleep(1100);

    //Read all timers (finished timers should be sorted to the end)
    await act(async () => {annyang.trigger(`read timers`)});
    expect(log).toHaveBeenCalledWith(`0. The timer for "${timerName1}" has 59 seconds remaining.`);
    expect(log).toHaveBeenLastCalledWith(`1. The timer for "${timerName2}" finished already.`);
});
