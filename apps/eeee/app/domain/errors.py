"""Domain errors for candidate selection and approval."""


class ApprovalError(ValueError):
    """A requested decision transition is invalid."""


class InsufficientCandidatesError(ApprovalError):
    """Fewer than two distinct repositories were compared."""


class UnknownCandidateError(ApprovalError):
    """A selected repository is absent from the comparison."""


class AlreadyApprovedError(ApprovalError):
    """An approved decision cannot be changed in place."""


class CandidateSetChangedError(ApprovalError):
    """The compared candidates changed before approval was saved."""
