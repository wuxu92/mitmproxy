import { combineReducers } from "redux";
import flow from "./flow";
import flowtree from "./flowtree";
import modal from "./modal";
import optionsEditor from "./optionsEditor";
import tabs from "./tabs";
import filter from "./filter";

// TODO: Just move ducks/ui/* into ducks/?
export default combineReducers({
    flow,
    modal,
    flowtree,
    optionsEditor,
    tabs,
    filter,
});
