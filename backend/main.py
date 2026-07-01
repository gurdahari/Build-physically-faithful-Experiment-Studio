from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import (
    SimulateRequest, SimulateResponse, StepResult,
    HamiltonianRequest, HamiltonianResponse,
    TimeDependentPulseRequest, TimeDependentPulseResponse,
    QuTiPPulseResponse, SolverComparisonResponse,
    ExperimentRequest, ExperimentResponse,
)
from physics.bloch import apply_rotation, apply_free_evolution
from physics.hamiltonian import simulate_hamiltonian
from physics.pulse import simulate_time_dependent_pulse
from physics.qutip_pulse import simulate_qutip_pulse, compare_solvers
from physics.experiment import simulate_experiment

app = FastAPI(title="Quantum Experiment Studio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # vite dev
        "http://localhost:5174",  # vite dev (fallback when 5173 is busy)
        "http://localhost:5200",  # vite preview
        "http://localhost:4173",  # vite preview alt
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Quantum backend is running"}


@app.post("/simulate/ideal-sequence", response_model=SimulateResponse)
def simulate_ideal_sequence(body: SimulateRequest) -> SimulateResponse:
    """
    Apply a sequence of pulses and free-evolution blocks to an initial Bloch
    vector using exact SO(3) rotation matrices.

    Returns the state after every step so the frontend can compare each
    intermediate result against its own calculation.
    """
    state: list[float] = list(body.initial_bloch)
    states: list[list[float]] = []
    steps: list[StepResult] = []

    for item in body.sequence:
        if item.type == "free":
            state = apply_free_evolution(item.omega0, item.tau, state)
            steps.append(StepResult(
                type="free",
                omega0=item.omega0,
                tau=item.tau,
                accumulated_phase=item.omega0 * item.tau,
            ))
        else:
            state = apply_rotation(item.axis, item.angle, state)
            steps.append(StepResult(
                type="pulse",
                axis=item.axis,
                angle=item.angle,
                accumulated_phase=None,
            ))
        states.append(list(state))

    return SimulateResponse(
        initial_state=list(body.initial_bloch),
        states=states,
        final_state=list(state) if states else list(body.initial_bloch),
        steps=steps,
    )


@app.post("/simulate/hamiltonian", response_model=HamiltonianResponse)
def simulate_hamiltonian_endpoint(body: HamiltonianRequest) -> HamiltonianResponse:
    """
    Evolve a Bloch vector under H = (ħ/2)(Ωx σx + Ωy σy + Ωz σz) for a given
    duration.  Returns the full trajectory (time + Bloch vector at each step).
    """
    result = simulate_hamiltonian(
        omega_x=body.omega_x,
        omega_y=body.omega_y,
        omega_z=body.omega_z,
        duration=body.duration,
        initial_bloch=list(body.initial_bloch),
        number_of_steps=body.number_of_steps,
    )
    return HamiltonianResponse(**result)


@app.post("/simulate/time-dependent-pulse", response_model=TimeDependentPulseResponse)
def simulate_td_pulse_endpoint(body: TimeDependentPulseRequest) -> TimeDependentPulseResponse:
    """
    Simulate a physically shaped pulse with time-dependent Hamiltonian:
      H(t) = (ħ/2)[Ω(t)cos(φ) σx + Ω(t)sin(φ) σy + Δ σz]

    Integrates dr/dt = Ω_eff(t) × r using RK4.
    Supports square and Gaussian envelope shapes.
    """
    result = simulate_time_dependent_pulse(
        pulse_shape=body.pulse_shape,
        amplitude=body.amplitude,
        phase=body.phase,
        detuning=body.detuning,
        duration=body.duration,
        initial_bloch=list(body.initial_bloch),
        number_of_steps=body.number_of_steps,
        sigma=body.sigma,
    )
    return TimeDependentPulseResponse(**result)


@app.post("/simulate/time-dependent-pulse/qutip", response_model=QuTiPPulseResponse)
def simulate_td_pulse_qutip(body: TimeDependentPulseRequest) -> QuTiPPulseResponse:
    """
    Same physics as the custom RK4 endpoint but solved with QuTiP's mesolve.

    Builds ρ₀ = 0.5*(I + x σx + y σy + z σz) from the Bloch vector, evolves
    under H(t) = 0.5*[Ω(t)cosφ σx + Ω(t)sinφ σy + Δ σz] with no collapse
    operators (purely unitary), and extracts ⟨σi⟩(t) as the Bloch trajectory.
    """
    result = simulate_qutip_pulse(
        pulse_shape=body.pulse_shape,
        amplitude=body.amplitude,
        phase=body.phase,
        detuning=body.detuning,
        duration=body.duration,
        initial_bloch=list(body.initial_bloch),
        number_of_steps=body.number_of_steps,
        sigma=body.sigma,
    )
    return QuTiPPulseResponse(**result)


@app.post("/simulate/time-dependent-pulse/compare", response_model=SolverComparisonResponse)
def compare_solvers_endpoint(body: TimeDependentPulseRequest) -> SolverComparisonResponse:
    """
    Run both custom RK4 and QuTiP on the same request and compare trajectories.

    Returns per-solver trajectories and final states, the Euclidean final-state
    difference, the maximum pointwise trajectory difference, Bloch norms (should
    equal the initial Bloch norm for unitary evolution), and a pass/fail flag
    at tolerance = 1e-3.
    """
    result = compare_solvers(
        pulse_shape=body.pulse_shape,
        amplitude=body.amplitude,
        phase=body.phase,
        detuning=body.detuning,
        duration=body.duration,
        initial_bloch=list(body.initial_bloch),
        number_of_steps=body.number_of_steps,
        sigma=body.sigma,
    )
    return SolverComparisonResponse(**result)


@app.post("/simulate/experiment", response_model=ExperimentResponse)
def simulate_experiment_endpoint(body: ExperimentRequest) -> ExperimentResponse:
    """
    Evolve an initial Bloch state through an ordered sequence of pulses and
    free-evolution blocks using QuTiP (mesolve) as the authoritative physics
    engine.

    Each item is solved with mesolve; the final density matrix of one item
    becomes the initial state of the next, ensuring exact quantum chaining.

    Quality selector maps to steps-per-item:
      preview  → 50   (fast, ~1 % error)
      standard → 200  (default)
      high     → 1000 (sub-1 ‰ error)

    The frontend must use this trajectory verbatim — no JS quantum physics.
    """
    result = simulate_experiment(
        initial_bloch=list(body.initial_bloch),
        sequence=[item.model_dump() for item in body.sequence],
        quality=body.quality,
        enable_decoherence=body.enable_decoherence,
        T1=body.T1,
        T2=body.T2,
        equilibrium_z=body.equilibrium_z,
    )
    return ExperimentResponse(**result)
