import React, {Component} from 'react';

//This CSS must go above the module imports!
import "bootstrap/dist/css/bootstrap.min.css";

import Recipe from './Recipe';

import './stylesheets/App.css';

export class App extends Component
{
    render()
    {
        return (
            <div className="App">
                <Recipe />
            </div>
        );
    }
}

export default App;
