# Tasksight - probabilistic task management for clear project pathways

Build confident plans from uncertain tasks, using a simple user interface on top
of powerful probabilistic tools.

## ENV Setup

- [Node.js (and npm)](https://nodejs.org/en/download/package-manager)
- Python 3

## Building

-   `python3 -m http.server 8001` from the root directory of the project.
-   `npm install` install all dependencies (only do once unless new deps
        are added)
-   `npm run build:watch` for typescript compilation
-   `npm run rollup:watch` for bundling and minifying.
    -   [build/index.html](build/index.html) for bundled and minified.

## TODO

-   Moving rows while an expanded node is present causes glitchy display
    problems.

    -   Moving the row down causes TaskGrid to re-render
        -   The row that moved up renders correctly in the correct place with
            the correct height
        -   The row that *moved* though has the wrong y offset (it appears 3
            YSKIP lower than it should be---though if it were replacing a fully
            expanded row it would be in the right place).
        -   Basically the style="transform: translate(0px, $$Y TARGET$$)" is
            wrong.
            -   This style is managed by lit-virtualizer, not by task-row or
                task-grid.
            -   Possibly the ResizeObserver isn't firing, or when it does, is
                being swallowed too early.
            -   Possibly the g.topo reference observed as LitElement.items isn't
                changing?
                -   But if that were true, we wouldn't be adjusting the
                    translation on them at all...
            -   keyfunction? Nope.
            -   If the N+1 child is artificially set to .active=true, at least
                the styling isn't messed up. Which makes me think that
                Virtualizer.js:\_positionChildren() is off by one.
                -   Hmm, no. Probably what's happening is that it's reusing the
                    old positioning from *before* the order change.
            -   LitVirtualizer.items is changing between these calls
                -   however, it has the same reference. So it's probably not
                    triggering re-rendering somehow.
                -   Ok, fixed that, but it's still not re-rendering the
                    children.
        -   NB: there's a LitVirtualizer.layoutComplete() promise. Is it useful?
        -   when selecting an element, Virtualizer.\_childrenPos is
            recalculated.
            -   when moving a task, \_childrenPos is also recalculated. So
                that's not it...
    -   in Virtualizer.\_positionChildren()

        -   pos.forEach iterates through the children in the correct order.
            -   eg, after moving 0 after 1, i see [1, 0, 2] correctly.
        -   however, the assigned top position is incorrect.
        -   this.\_childPos is set from \_updateDOM(state), an async method.

            -   updateDOM is called from handleLayoutMessage
            -   handleLayoutMessage is passed as a callback to this.layout's
                constructor, which is a FlowLayout. The callback is stored in
                the BaseLayout as the hostSink. When BaseLayout sends a
                stateChanged message to the Virtualizer, that's when we run
                updateDOM.
            -   BaseLayout.sendStateChangedMessage is what actually seems to
                measure the children. It creates a new Map of child positions,
                and populates it by index, calling getItemPosition(idx) to
                create the position information. The position information we're
                interested in is the 'top' value. getItemPosition is an abstract
                method devined on the Flow.
            -   Flow.getItemPosition has a bunch of members that don't make
                immediate sense and need to be printed.
                -   The one of interest is positionDim = 'top', which is what's
                    not working in our example.

        -   So the node that moves, in getItemPosition, gets the wrong 'top'. It
            seems to be using its own height instead.

            -   I note that the keys in childrenPos don't correspond to the ids
                on the tasks.

        -   In getPosition, I notice in the first round we skip index 1, which
            is the old #2 that slid up. Which is crucial because it's size
            is 24. And if we're assuming instead that it has old #1, which is
            72, then we'll miscalculate the proper value for #2.

            -   Why do we not _getItemPosition for all of them??
            -   yeah, in fact later in this sequence of calls, there's a
                getPosition #1 that has size 72.
                -   That WOULD be true if idx == Task.id. But it's false if
                    idx == position in .items.
            -   what is the Idx anyway?
                -   in this case, it comes from sendStateChangedMessage, where
                    we iterate from BaseLayout.first .. .last. So these are
                    indices of .item. In BaseLayout, these are on _items. So
                    it's possible that _items has a stale version of g.topo or
                    something?? but then why wouldn't #2 and #3 fail to swap
                    completely?
                -   physicalItems[item idx] => {position, size}
                -   newPhysicalItems[item idx] ==> ^^ "track chrildren across
                    reflows"
                -   metricsCache: ??

    -   Now we're going to try logging traces whenever getPosition is called so
        we can see how it's used.

        -   On initial page load, it's called through reflowIfNeeded, from
            _hostElementSizeChanged.
            -   schedule
                -   updateLayout
                    -   reflowIfNeeded -_reflow _updateVisibleIndices
                        _getItemPosition _getPosition
        -   then rapidly again from _childrenSizeChanged _measureChildren
            _schedule (... same from here...)
        -   then again from _hostElementSizeChanged _schedule _updateLayout
            _updateView set viewportSize _checkTresholds _updateVisibleIndices
            _getItemPosition _getPosition

    -   When we click item index 1, we observe _childrenSizeChanged >
        _measureChildren > _schedule > -uploateLayout > reflowIfNeeded >
        reflow > reflow > getActiveItems > getItems > getPosition then
        updateVisibleIndices Here for idx 2, it already has the correct position
        (96), despite never getting a call for getPosition idx1, which is the
        wide one that changed sizes. So something else is updating its width.
        Only later do we have sendStateChangedMessage. - which is then almost
        immediately followed by _hostElementSizeChanged.

    -   Now when we reorder: keydown > shiftDown > requestUpdate >
        performUpdate > ... > updateVirtualizerConfig > set items > _schedule >
        _updateLayout > rreflowIfNeeded > reflow > getActiveItems > getItems >
        getPosition

        -   followed immediately by updateVisibleIndices, and then
            sendStateChangedMessage, at which point the new idx1 has the size of
            the old idx1. And the new idx2 has the size of the old idx2.

    -   Now clicking Escape _childrenSizeChanged > measureChildren > _schedule >
        updateLayout > reflowIfNeeded > reflow > reflow > getActiveItems >
        getItems > getPosition.

        -   followed immediately by updateVisibleIndices and
            sendStateChangedMessage.
        -   then another cascade rooted in _hostElementSizeChanged.

    -   So, my hypothesis is that whatever is caching the {size} element isn't
        getting reset when [set items] is called, which is causing it to get
        recycled. Presumably [set items] should call measureChildren, or at
        least use the key function to try to guess remapped values for the
        cached {size} between calls to [set items]. ^^^^^^^^^

        -   Yup. Calling _measureChildren after the reordering fixes the
            display.
        -   This is probably a bug in virtualizer. Let's see if we can see where
            the breakdown occurred. Where else is _measureChildren called?

    -   So I was eventually able to make it work, but it sucks. I can only get
        it to work by modifying Virtualizer.[set item] to schedule
        _measureChildren instead of scheduling _updateLayout. I can't think of a
        good way to patch this behavior from inside my app. So right now I'll
        live with this unrecorded patch.

-   TODO: on task-grid motions, use LitVirtualizer.element(NNN).scrollIntoView()
    instead, because it works correctly if NNN is not currently in the DOM.

-   Menus

    -   Add Select menu
        -   Next / Prev / Grow up / Grow down
        -   Unselect all
    -   Add Edit items
        -   Edit task name 'RET'
        -   Edit task estimate 'ee'
    -   Add View items
        -   Show details panel

-   blocked tasks aren't rendering a blocked status icon

-   milestones aren't rendering again in milestone view

-   deadlines

-   For drawing links, create a toolbar item. When active, draws links.

-   prod build

    -   sourcemaps don't make it through rollup.
    -   move icons to build/

-   task grouping a la sheets

-   undo/redo

-   ctrl-up, ctrl-down should reorder tasks (including fixing up dependencies)

-   reordering tasks by drag/drop

-   add eng estimates

-   Actions: Find a way to unify the logic of the toolbar icons and the menu
    items. They do the same things, but can't be shared right now.

-   dragging on an unhighlighted row should highlight (a range of) rows.

    -   dragging on a highlighted row should move tasks.

-   help panel with keyboard shortcuts

-   completion graphs

    -   deal with deadlines
    -   relative dates
    -   add holidays to graph
    -   show value on mouse hover
    -   's-g' to show graphs
    -   's-s' to show start dates
    -   's-f' to show finish dates
    -   's-d' to show deadline dates
    -   's-e' to show estimates
    -   's-c' to show completed tasks
    -   's-c' to show completed tasks

-   workday-aware date addition

    -   edit holidays
    -   common holidays
    -   this is actually a subset of a scheduling policy engine. If a task is
        pinned to a person, it has to schedule on that person. If it's not,
        it'll schedule on whoever is available. If two tasks are runnable on the
        same person, then try running them in parallel or in either order and
        optimize for lowest cost ()

-   save

    -   It would be useful to support a few embeddings:
    -   as an AppsScript Sheets extension to allow editing any sheet with a DAG
    -   as a Google Drive App that can save its own data as a JSON blob
    -   as a Colab javascript editor that produces numpy array output
    -   as a VSCode editor that can save JSON or a text proto.

-   fix navigation

    -   left/right arrows should highlight different columns

-   handle unestimated tasks

    -   click to scroll to unestimated task
    -   highlight row for unestimated tasks

-   undo/redo -- OT (operational transform)

    -   hammer it--generate random mutations, snapshot, apply, revert, compare
    -   merge edits from another user

-   icons for all tools

    -   resizable task column divider

-   gantt column -- show lb/ub/median start -- end dates

-   scheduling constraints

    -   assignee column?
    -   not all immediately executable tasks will be executed immediately.
    -   allow specifying how many workers there are (at a project level, or at a
        task group level).

-   key journeys to think through:

    -   portfolio view -- shows all the projects in this portfolio with end
        dates
    -   Dealing with multiple projects for a single team:
        -   Multiple projects running in parallel on the same engineers will
            impact each other's timelines
        -   Option 1: for each task, define a "utilization" for engineering, add
            an optional assignee to pin the task to a particular person (if not
            set, the simulation just picks whoever is free). We adjust the end
            dates based on how much engineering time is required and how much is
            available, on a per-scenario basis.
            -   this should affect the project even when the other projects are
                not viewable
            -   which means the projects have to belong to a team, to define the
                total number of SWEs and the other competing projects
            -   the visualization is tricky -- we can in the details expando try
                to show how much the delay is due to other projects and lack of
                utilization, and we could show a gantt chart for all projects on
                the team
            -   doesn't allow us to account for maintenance and overhead (how
                would you want to do this??)
            -   also doesn't account for scheduling choices we want to be able
                to make -- prioritizing certain milestones at the expense of
                others (would we do this with a stack rank? could set
                allocation -- eg, this project should never steal more than 20%
                of our effort?)
            -   if milestones have deadlines, we could optimize for hitting as
                many deadlines as possible. If milestones had business value on
                delivery, and costs on missed deadlines, then we could optimize
                for reducing costs and maximizing value delivery
            -   we should have levels of fidelity for representing eng
                availability
            -   eg: from just a rough "60-70% allocated to this team" all the
                way to a list of available dates or non-available dates.
            -   it would be cool to figure out how to write a plugin
                architecture for this, so teams could plugging into oncall
                calendars to do it automatically, or not!
        -   Option 2: separate eng tasks from waiting tasks, but otherwise do
            the thing above.
        -   Option 3: allow explicit ordering of tasks
            -   i suppose this could actually be done just as is -- all you have
                to do is add an edge between two tasks to force an ordering.
                It's just a bit difficult to show this from the perspective of a
                single project. (this looks like a foreign reference?)
        -   Will need some way to pause and defer projects en masse -- eg, we're
            stopping work on some project while we finish something else. Or
            we've defined this project, but it's not approved for development.
            Something like just ordering the backlog might achieve this, but it
            would be nice to say that we're just not planning to work on
            something at all.
    -   backlog -- shows all projects, shows project dependencies
    -   (depending on a task in another project --- how to do it?)
        -   from the simulation's POV, there's no such thing as a project --
            it's all simulated at a task level anyway. It's just odd to depend
            on a task that's not in the current view.
    -   common task library
    -   create and edit tasks that can be shared by others.
    -   when creating a new task, give the option to choose an existing one.
    -   attaching business value to milestones
    -   curating and managing the levers we use for estimates
    -   tracking their changes over time as we learn more from our projects (eg
        experiment results show that the predicted impact on the lever wasn't as
        high as expected)
    -   tracking their changes over time as we learn more about the world (eg we
        have new OMG data that changes the confidence intervals on expected
        impact duration / frequency).
    -   tracking eng effort
    -   consider a chrome extension? We want to compare estimated eng time to
        actual eng time so we can improve our estimates, but also so we can
        calculate the actual ROI at the end of the project.
    -   handling maintenance, outages, and breakages
    -   would be cool if we could list our areas of ownership and track time
        against maintaining them
    -   similar if we're supporting customers -- if we were a company, we'd
        either be billing these folks, or burning down support against our
        contract. Not that we're going to penalize or refuse to support these
        customers, but we could be asking them for more information on the
        impact that we're enabling.
